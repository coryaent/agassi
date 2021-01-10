"use strict";

const log = require ('./logger.js');

const Config = require ('./config.js');

const Cluster = require ('./cluster.js');

const HTTP = require ('./http/http.js');
const HTTPS = require ('./http/https.js');

const ACME = require ('./acme.js');

const rqlite = require ('./rqlite/rqlite.js');
const rqlited = require ('./rqlite/rqlited.js');
const Query = require ('./rqlite/query.js');

const Docker = require('./docker.js');
const ip = require ('ip');

// fetch all networks
Docker.API.listNetworks ().then (function findAgassiOverlay (networks) {
    // determine which is the relevent overlay
    const overlayNetwork = networks.find ((network) => {
        return network.Labels && network.Labels[Config.networkLabelKey] == Config.networkLabelValue;
    });
    // get the subnet and address parameters for the cluster
    const subnet = overlayNetwork.IPAM.Config[0].Subnet;
    const address = require ('@emmsdan/network-address').v4.find ((address) => {
        return ip.cidrSubnet (subnet).contains (address);
    });
    // start/join the cluster/standalone process
    Cluster.start (address, subnet, Config.standalone);
});

// start listening to Docker socket
rqlited.status.once ('ready', async () => {
    Cluster.advertise ('ready');
    if (rqlited.isLeader ()) {
        await ACME.createAccount ();
        await rqlite.dbTransact ([
            Query.services.createTable,
            Query.challenges.createTable,
            Query.certificates.createTable
        ]);
    }
    HTTP.start ();
});

HTTP.server.once ('listening', () => {
    Docker.Events.start ();
});

// add possible existing services on socket connection
Docker.Events.on ('connect' , async function checkExistingServices () {
    if (rqlited.isLeader ()) {
        // get all service ID's
        const allSwarmServiceIDs = await Docker.API.listServices ().map (service => service.ID);

        // filter those which have the requisite labels
        const agassiSwarmServices = allSwarmServiceIDs.map (async (id) => { 
            await Docker.API.getService (id).inspect (); 
        }).filter ((service) => {
            return Docker.isAgassiService (service);
        });

        // pull rqlited services from database
        const dbServiceIDs = (await rqlite.dbQuery ('SELECT id FROM services;', 'strong')).results.map (result => result.id);

        // if swarm has service that rqlited doesn't, add service and cert to rqlited
        agassiSwarmServices.filter (service => !dbServiceIDs.includes (service.ID)).forEach (async (service) => {
            await Docker.pushServiceToDB (service);
            await ACME.certify (service.Spec.Labels[Config.serviceLabelPrefix + 'domain']);
        });

        // if rqlited has service that swarm doesn't, remvoe the service and not the cert
        dbServiceIDs.filter (id => !allSwarmServiceIDs.includes (id)).forEach (async (id) => {
            await Docker.removeServiceFromDB (id);
        });
    }
    HTTPS.start ();
});

HTTPS.server.once ('listening', () => {
    ACME.maintenance.start ();
});

rqlited.status.on ('disconnected', () => {
    Cluster.advertise ('disconnected');
    HTTPS.stop ();
});

rqlited.status.on ('reconnected', () => {
    Cluster.advertise ('reconnected');
    HTTPS.start ();
});

Docker.Events.on ('_message', async function processDockerEvent (event) {
    if (rqlited.isLeader ()) {
        // on service creation, update or removal
        if (event.Type === 'service') {
            const service = await Docker.API.getService (event.Actor.ID).inspect ();
            if (Docker.isAgassiService (service)) {

                if (event.Action === 'update' || event.Action === 'create') {
                    await Docker.pushServiceToDB (service);
                    if (event.Action === 'create') {
                        await ACME.certify (service.Spec.Labels[Config.serviceLabelPrefix + 'domain']);
                    }
                }
                if (event.Action === 'remove') {
                    await Docker.removeServiceFromDB (event.Actor.ID);
                }
            }
        }
    }
});

process.on ('SIGINT', () => {
    log.info ('SIGINT ignored, use SIGTERM to exit.');
});

process.on ('SIGTERM', () => {
    log.info ('SIGTERM received, exiting...');
    ACME.maintenance.stop ();
    Docker.Events.stop ();
    HTTPS.stop ();
    HTTP.stop ();
    Cluster.stop ();
});