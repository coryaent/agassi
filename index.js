"use strict";

const print = require ('./print.js');

const ip = require ('ip');

const Docker = require ('dockerode');
const DockerEvents = require ('docker-events');

const docker = new Docker ();

// fetch all networks
docker.listNetworks ().then ((networks) => {
    // determine which is the relevent overlay
    const overlayNetwork = networks.find ((network) => {
        return network.Labels && network.Labels['agassi'] == 'overlay';
    });
    // get the subnet and address parameters for the cluster
    const subnet = overlayNetwork.IPAM.Config[0].Subnet;
    const address = require ('@emmsdan/network-address').v4.find ((address) => {
        return ip.cidrSubnet (subnet).contains (address);
    });
    // start/join the cluster
});
