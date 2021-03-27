"use strict";

const http = require ('http');
const phin = require ('phin');
const { randoSequence } = require ('@nastyox/rando.js');
const retry = require ('@lifeomic/attempt').retry;
const ndjson = require ('ndjson');
const rr = require ('rr');
const os = require ('os');
const ip = require ('ip');

const Cache = require ('../cache.js');
const Certificate = require ('../certificate.js');

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


// client agent for sharing certs (and challenges)
const shareAgent = new http.Agent ({
    keepAlive: true
});

/*
    synchronization steps:
    1. get list of certs from all peers
    2. create a set of all needed certs by combining peer cert lists
    3. starting with the peer with the most certs
        a. pull all the certs from that peer
        b. remove pulled certs from the needed set
    4. pull remaining certs from each peer until the needed set is empty
*/
async function sync () {
    // disregard any peers added during this function call
    let peers = discovery.peers ();

    // get an array of arrays of all the hashes on each peer
    let hashLists = await Promise.all (peers.map (peer => {
        (phin ({
            method: 'GET',
            url: `http://${peer.address}:${peer.port}/certs/list`,
            parse: 'json',
            timeout: 5000,
            core: {
                agent: shareAgent
            }
        })).body;
    }));
    // map which peer address has which certs
    const peerHashLists = new Map ();
    peers.forEach ((peer, index) => {
        peerHashLists.set (`${peer.address}:${peer.port}`, hashLists[index]);
    });

    // create a set of needed certs
    const needed = new Set ();
    hashLists.forEach (list => {
        list.forEach (certHash => {
            if (!Cache.certificates.has (certHash)) {
                needed.add (certHash);
            }
        });
    });
    // if this node has all the certs that other nodes do, stop sync'ing
    if (needed.size === 0) {
        return;
    }

    // assume most peers have most certs and map which hashes
    // will be fetched from which peers (load balance)
    const certMap = new Map ();
    peers.forEach (peer => certMap.set (`${peer.address}:${peer.port}`), new Array ());
    // map each cert hash to a random-ish peer
    needed.forEach (certHash => {
        certMap.get (randoSequence (peers).find (peer => {
            peerHashLists.get (`${peer.address}:${peer.port}`).has (certHash);
        })).push (certHash);
    });
    
    // pull the certs ("heavy lifting")
    return Promise.all (Array.from (certMap.keys ()).map (peer => {
        return new Promise ((resolve, reject) => {
            phin ({
                method: 'GET',
                url: `http://${peer}/${createCertQuery (certMap.get (peer))}`,
                stream: true,
                core: {
                    agent: shareAgent
                }
            }).then (stream => {
                let added = 0;
                stream.pipe (ndjson.parse ())
                .on ('data', _cert => {
                    let cert = new Certificate (_cert.body, _cert.domain, _cert.expiration);
                    let _hash = Object.keys (_cert)[0];
                    if (cert.hash () === _hash) {
                        if (!Cache.certificates.has (_hash)) {
                            cert.cache ();
                            added++;
                        }
                    } else {
                        stream.destroy ();
                        throw new Error (`Cache or hash error on certificate ${_hash}.`);
                    }
                })
                .on ('end', () => {
                    resolve (added);
                });
            }).catch (error => {
                reject (error);
            });
        });
    }));
}

function createCertQuery (hashes) {
    let query = '';
    hashes.forEach (hash => query += `q=${hash}&`);
    return query;
}

async function push (hash, certificate) {
    return Promise.all (discovery.peers ().map (peer => {
        retry (
            phin ({
                method: 'POST',
                url: `http://${peer.address}:${peer.port}/`,
                data: JSON.stringify ({
                    [hash]: certificate
                }),
                core: {
                    agent: shareAgent
                }
            }),
        {
            // retry options
            timeout: 5000,
            factor: 1,
            delay: 1,
            maxAttempts: 3
        });
    }));
}

async function pullCerts (certHashes, chunkSize) {
    let query = '';
    for (let hash of certHashes) {
        query += 'q=' + hash + '&';
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