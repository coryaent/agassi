"use strict";

const os = require ('os');
const ip = require ('ip');

const Cache = require ('../cache.js');
const client = require ('../acme/client.js');

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

discovery.once ('promotion', async () => {
    log.debug (`Creating ACME account with email ${Config.acmeEmail.replace ('mailto:', '')}...`);
    await client.createAccount ({
        termsOfServiceAgreed: true,
        contact: [Config.acmeEmail]
    });
    log.debug (`ACME account created with email ${Config.acmeEmail.replace ('mailto:', '')}.`);
});

module.exports = {
    discovery,
    share
};