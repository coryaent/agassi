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

const waitPort = require ('wait-port');
const Docker = require('./docker.js');
const ip = require ('ip');

// wait for remote socket if necessary
const dockerURL = new URL (Config.dockerSocket);
if (dockerURL.protocol.startsWith ('unix')) {
    main ();
} else {
    waitPort ({
        host: dockerURL.hostname,
        port: dockerURL.port,
        output: 'silent',
        timeout: Config.dockerSocketTimeout * 1000
    }).then ((open) => {
        if (open) {
            main ();
        } else {
            throw new Error (`Could not find docker socket at ${Config.dockerSocket}.`);
        }
    });
}

function main () {
    // be ready to respond to challenges
    HTTP.start ();
    // initialize docker client
    Docker.initialize (dockerURL);
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
        // start/join the cluster/standalone process and set client address
        rqlite.initialize (address);
        Cluster.start (address, subnet, Config.standalone);
    });

    // wait for rqlited to start
    rqlited.status.once ('ready', async () => {
        Cluster.advertise ('ready');
        if (rqlited.isLeader ()) {
            // initialize ACME accont and database tables
            await ACME.createAccount ();
            log.debug ('Initializing rqlite tables...');
            const tableCreationTransaction = await rqlite.dbTransact ([
                Query.services.createTable,
                Query.challenges.createTable,
                Query.certificates.createTable
            ]);
            log.debug (`Initialized tables in ${tableCreationTransaction.time * 1000} ms.`);
        }
        // start listening to Docker socket
        Docker.Events.start ();
    });

    // add possible existing services on socket connection
    Docker.Events.on ('connect' , async function checkExistingServices () {
        if (rqlited.isLeader ()) {
            log.debug ('Checking existing docker services for agassi labels...');
            // get all service ID's
            const allSwarmServiceIDs = (await Docker.API.listServices ()).map (service => service.ID);

            // filter those which have the requisite labels
            const agassiSwarmServices = [];
            for (let id of allSwarmServiceIDs) {
                const service = await Docker.API.getService (id).inspect ();
                if (Docker.isAgassiService (service)) {
                    log.debug (`Found agassi service ${service.ID}.`);
                    agassiSwarmServices.push (service);
                }
            }

            // pull rqlited services from database
            const dbServiceIDs = (await rqlite.dbQuery ('SELECT id FROM services;', 'strong')).results.map (result => result.id);

            log.debug (`Database has (${dbServiceIDs.length}/${agassiSwarmServices.length}) docker services.`);

            // if swarm has service that rqlited doesn't, add service and cert to rqlited
            agassiSwarmServices.filter (service => !dbServiceIDs.includes (service.ID)).forEach (async (service) => {
                await Docker.pushServiceToDB (service);
                await ACME.certify (Docker.parseServiceLabels(service)[Config.serviceLabelPrefix + 'domain']);
            });

            // if rqlited has service that swarm doesn't, remvoe the service and not the cert
            dbServiceIDs.filter (id => !allSwarmServiceIDs.includes (id)).forEach (async (id) => {
                await Docker.removeServiceFromDB (id);
            });
        }
        HTTPS.start ();
    });

    HTTPS.Server.once ('listening', () => {
        ACME.Maintenance.start ();
    });

    rqlited.status.on ('disconnected', () => {
        HTTPS.stop ();
        Cluster.advertise ('disconnected');
    });

    rqlited.status.on ('reconnected', () => {
        HTTPS.start ();
        Cluster.advertise ('reconnected');
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
                            await ACME.certify (Docker.parseServiceLabels(service)[Config.serviceLabelPrefix + 'domain']);
                        }
                    }
                    if (event.Action === 'remove') {
                        await Docker.removeServiceFromDB (event.Actor.ID);
                    }
                }
            }
        }
    });
}

process.on ('SIGINT', () => {
    log.info ('SIGINT ignored, use SIGTERM to exit.');
});

process.on ('SIGTERM', () => {
    log.info ('SIGTERM received, exiting...');
    ACME.Maintenance.stop ();
    Docker.Events.stop ();
    HTTPS.stop ();
    HTTP.stop ();
    Cluster.stop ();
});