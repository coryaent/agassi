"use strict";

const Config = require ('./config.js');

const Cluster = require ('./cluster.js');

const HTTP = require ('./http/http.js');
const HTTPS = require ('./http/https.js');

const ACME = require ('./acme.js');

const rqlite = require ('../rqlite/rqlite.js');
const rqlited = require ('../rqlite/rqlited.js');
const Query = require ('../rqlite/query.js');

const Docker = require('./docker.js');

// fetch all networks
Docker.API.listNetworks ().then ((networks) => {
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
    if (Config.standalone) {
        rqlited.spawn (address);
    } else {
        Cluster.start (address, subnet);
    }
});

// start listening to Docker socket
rqlited.status.once ('ready', async () => {
    if (rqlited.isLeader ()) {
        await rqlite.dbTransact ([
            Query.services.createTable,
            Query.challenges.createTable,
            Query.certificates.createTable
        ], 'strong');
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
        const swarmServiceIDs = allSwarmServiceIDs.map (async (id) => { 
            await Docker.API.getService (id).inspect (); 
        }).filter ((service) => {
            return Docker.isAgassiService (service);
        }).map (service => service.ID);

        // pull rqlited services from database
        const dbServiceIDs = (await rqlite.dbQuery ('SELECT id FROM services;')).results.map (result => result.id);

        // if swarm has service that rqlited doesn't, add service and cert to rqlited

        // if rqlited has service that swarm doesn't, and rqlited has no pending challenge,
        // remove the service from rqlited without removing the cert
    }
    HTTPS.start ();
});

Docker.Events.on ('_message', async (event) => {
    // on service creation, update or removal
    if (event.Type === 'service') {
        const service = await Docker.API.getService (event.Actor.ID).inspect ();
        if (Docker.isAgassiService (service)) {

            if (event.action === 'update' || event.action === 'create') {
                await Docker.addServiceToDB (service);
                if (event.Action === 'create') {
                    await ACME.addNewCertToDB (service.Spec.Labels[Config.serviceLabelPrefix + 'domain']);
                }
            }
            if (event.Action === 'remove') {
                await Docker.removeServiceFromDB (event.Actor.ID);
            }
        }
    }
});