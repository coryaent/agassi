"use strict";

const os = require ('os');
const ip = require ('ip');

const Cache = require ('../cache.js');

// share listening server and automatic discovery
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

/* 
    Challenge {
        token: <String>,
        response: <String>
    }
*/
discovery.on ('challenge', function cacheChallengeResponse (challenge) {
    Cache.challenges.set (
        JSON.parse (challenge).token, 
        JSON.parse (challenge).response);
});

module.exports = {
    discovery,
    share
};