"use strict";

const print = require ('./print.js');

const Config = require ('./config.js');
const Cluster = require ('./cluster.js');

const rqlite = require ('./rqlite/rqlite.js');
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
    // start/join the cluster
    Cluster.start (address, subnet);
});

// start listening to Docker socket
Cluster.rqlited.once ('ready', () => {
    Docker.Events.start ();
});

const requisiteLabels = ['protocol', 'domain', 'port'];
Docker.Events.on ('connect', async function checkAndAddServices () {
    // get all service ID's
    const swarmServiceIDs = await Docker.API.listServices ().map (service => service.ID);

    // filter those which have the requisite labels
    const agassiSwarmServiceIDs = swarmServiceIDs.map (async (id) => { 
        await Docker.API.getService (id).inspect (); 
    }).filter ((service) => {
        requisiteLabels.every ((requisiteLabel) => {
            Object.keys (service.Spec.Labels).some ((serviceLabel) => {
                serviceLabel == Config.serviceLabelPrefix + requisiteLabel;
            });
        });
    }).map (service => service.ID);

    // pull rqlited services from database

    // if swarm has service that rqlited doesn't, add service and cert to rqlited

    // if rqlited has service that swarm doesn't, and rqlited has no pending challenge,
    // remove the service from rqlited without removing the cert
});