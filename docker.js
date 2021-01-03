"use strict";

const Docker = require ('dockerode');
const DockerEvents = require ('docker-events');

const docker = new Docker ();

const getIpAddresses = require ('get-ip-addresses').getIpAddresses;

const { networkInterfaces } = require('os');
const { isInSubnet } = require('is-in-subnet');


// console.log (networkInterfaces ());

// console.log(getIpAddresses());


const getNetworks = new Promise (async function getNetworks (resolve, reject) {  
    let condition;  
    
    if (true) {    
        resolve ('Promise is resolved successfully.');  
    } else {    
        reject ('Promise is rejected');  
    }
});

// docker.listNetworks ().then ((networks) => {
//     const agassiOverlay_ = networks.find ((network) => {
//         return network.Labels && network.Labels['agassi'] == 'overlay';
//     });
//     console.log (agassiOverlay_.Id);
//     const agassiOverlay = docker.getNetwork (agassiOverlay_.Id)
//     agassiOverlay.inspect ().then ((networkDetail) => {
//         console.log (networkDetail);
//     })
// });

// fetch a network
docker.listNetworks ().then ((networks) => {
    const agassiOverlay = networks.find ((network) => {
        return network.Labels && network.Labels['agassi'] == 'overlay';
    });
    console.log (agassiOverlay.Id);
});

// fetch network subnet
docker.listNetworks ().then ((networks) => {
    const agassiOverlay = networks.find ((network) => {
        return network.Labels && network.Labels['agassi'] == 'overlay';
    });
    console.log (agassiOverlay.IPAM.Config[0].Subnet);
});

// print all IPv4 addresses
Object.values (networkInterfaces ()).filter ((networkInterface) => {
    // inteface[0].family == 'IPv4' && isInSubnet (interface.)
    // console.log (networkInterface);
    // console.log (Object.values (networkInterface));
    const addresses = networkInterface.filter ((subInterface) => {
        return subInterface.family && subInterface.family == 'IPv4';
    });
    console.log (addresses);
});

// get all IPv4 addresses
Object.values (networkInterfaces ()).filter ((networkInterface) => {
    // inteface[0].family == 'IPv4' && isInSubnet (interface.)
    // console.log (networkInterface);
    // console.log (Object.values (networkInterface));
    networkInterface.map ((subInterface) => {
        if (subInterface.family == 'IPv4') {
            console.log (subInterface.address);
        }
    });
});

module.exports = {
    some: "value",
    someThis: function printThis () {
        console.log (this);
        console.log (this.some);
        console.log (this.setme);
    },
    another: {
        some: "another-value",
        anotherThis: function printThis () {
            console.log (this);
            // console.log (this.parent.some);
        },
    },
};

// console.log (this);