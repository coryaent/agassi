"use strict";

const http = require ('http');
const phin = require ('phin');
const rr = require ('rr');
const os = require ('os');
const ip = require ('ip');

const discovery = require ('./discovery.js');
const share = require ('./share.js');

share.on ('listening', function startDiscovery () {
    // share.address ();
    let netinfo = Object.values (os.networkInterfaces ()).find (interface => {
        return share.address ().family == interface.family && 
               share.address ().address == interface.address;
    });
    discovery.start ({
        address: netinfo.address,
        port: parseInt (process.env.PORT),
        broadcast: ip.cidrSubnet (netinfo.cidr).broadcastAddress
    })
});

share.on ('close', function stopDiscovery () {
    discovery.stop ();
});

const shareAgent = new http.Agent ({
    keepAlive: true,
    maxSockets: 1
});

async function sync (allCertHashes) {

}

async function pullCerts (certHashes, chunkSize) {
    let query = '';
    for (let hash of certHashes) {
        query += 'q=' + hash;
    }
    try {
        return await phin ({
            url: `http://${rr (discover.peers ()).address}:${process.env.PORT}/certs?${query}`,
            parse: 'json',
            timeout: 1000
        });
    } catch {
        return Promise.any (discovery.peers ().map (peer => {
            phin ({
                url: `http://${peer.address}:${process.env.PORT}/certs?${query}`,
                parse: 'json',
                timeout: 2000
            });
        }));
    }
}

module.exports = {
    discovery,
    share
};