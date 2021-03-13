"use strict";

const log = require ('./logger.js');

const Discover = require ('node-discover');
const EventEmitter = require ('events');
const http = require ('http');
const iprange = require ('iprange');
const querystring = require ('querystring');

const Cache = require ('./cache.js');
const Certificate = require ('./certificate.js');
const Config = require('./config.js');

// default options (TCP/UDP)
const port = 1986;

/*
    GET /certs?q=c4ca4238a0b923820dcc509a6f75849b&q=c81e728d9d4c2f636f067f89cc14862c... -> get certs
    GET /certs/list -> get an array of all cert hashes
    GET /challenge?token=x -> get response to an acme challenge

    POST / -> validate then add certs in request body to cache
*/
const Share = http.createServer (async (request, response) => {
    // request will be either a GET or a POST
    switch (request.method) {
        case 'HEAD':
        case 'GET':
            const path = request.url.substring (0, request.url.indexOf ('?'));
            switch (path) {
                case '/certs':
                    // pull certificates from cache and return
                    const keys = querystring.parse (request.url.substring (request.url.indexOf ('?') + 1)).q;
                    const certs = Cache.certificates.mget (keys);
                    response.writeHead (200, {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength (JSON.stringify (certs))
                    });
                    if (request.method !== 'HEAD') { response.write (JSON.stringify (certs)); }
                    response.end ();
                    return;
                case '/certs/list':
                    // get list of all certificate hashes
                    const hashes = Cache.certificates.keys ();
                    response.writeHead (200, {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength (JSON.stringify (hashes))
                    });
                    if (request.method !== 'HEAD') { response.write (JSON.stringify (hashes)); }
                    response.end ();
                    return;
                case '/challenge':
                    // get response to an ACME challenge
                    const token = querystring.parse (request.url.substring (request.url.indexOf ('?') + 1)).token;
                    const challengeResponse = Cache.challenges.get (token);
                    response.writeHead (200, {
                        'Content-Type': 'text/plain',
                        'Content-Length': Buffer.byteLength (challengeResponse)
                    });
                    if (request.method !== 'HEAD') { response.write (challengeResponse); }
                    response.end ();
                    return;
                default:
                    response.writeHead (404);
                    response.end ();
                    return;
            }
        case 'POST':
            // add new certificates to the cache
            let body = '';
            request.on ('data', chunk => {
                body += chunk;
            });
            request.on ('end', () => {
                // check that certs were added properly
                let newlyAdded = false;
                let received = JSON.parse (body);
                for (let hash of Object.keys (received)) {
                    // skip any certs that this node already has cached
                    if (!Cache.certificates.has (hash)) {
                        let cert = new Certificate (received[hash].body, received[hash].domain, received[hash].expiration);
                        // check the hash and cache the cert
                        if (hash === cert.hash () && cert.cache ()) {
                            newlyAdded = true;
                        } else {
                            // something went wrong adding this cert
                            response.writeHead (500, `Cache or hash error on certificate ${hash}.`);
                            response.end ();
                            return;
                        }
                    }
                }
                response.writeHead (newlyAdded ? 201 : 200);
                response.end ();
                return;
            });
            break;
        default:
            // only HEAD, GET and POST are implemented
            response.writeHead (501);
            response.end ();
            return;
    }
}).on ('listening', () => {
    log.info ('HTTP server started.');
}).on ('close', () => {
    log.info ('HTTP server stopped.');
});

// callback on discover creation
async function initialize (error) {

    if (error) { 
        process.exitCode = 1;
        throw error;
    }

    // log.debug ('Looking for peers...');
    const retries = 3; let attempt = 1;
    while ((Peers.size < 1) && (attempt <= retries)) {
        log.debug (`Looking for peers. Attempt (${attempt}/${retries})...`);
        // backoff
        await sleep ( attempt * 30 * 1000);
        if (Peers.size < 1) {
            attempt++;
        }
    }

    if (Peers.size == 0) { 
        log.warn ('Could not find any peers.'); 
    }

    // indicates completion status and joinHost
    // if this cluster node is master, "const joinAddress"
    // will be undefined here
    const joinAddress = isMaster ? undefined : Array.from (Peers.values ());
    discovery.emit ('complete', options.address, joinAddress);
};

const discovery = new EventEmitter ()
.once ('complete', async function spawnRqlited (listenAddress, joinAddress) {
    rqlited.spawn (listenAddress, joinAddress, false);
});

const RemovalTimeouts = new Map ();

async function removeNode (nodeID) {
    // if this node is master, remove the lost node
    if (RemovalTimeouts.has (nodeID)) {
        log.debug (`Removing node ${nodeID}...`);
        await rqlite.removeNode (nodeID);
        RemovalTimeouts.delete (nodeID);
    }
}

const ChallengeResponses = new EventEmitter ();

var discover = null;

module.exports = {
    
    start: (address, subnet, standalone) => {
        // start rqlited in standalone mode
        if (standalone === true) {
            log.debug ('Starting rqlited in standalone mode...');
            rqlited.spawn (address, null, standalone);
            return;
        }
        // start automatic discovery
        log.debug (`Starting automatic discovery with address ${address}...`);
        options.address = address;
        options.unicast = iprange (subnet);

    },

    ChallengeResponses,

    indicateChallengeResponse: (token, order) => {
        if (!Config.standalone) {
            if (discover && discover instanceof Discover) {
                discover.send ('challenge.responses', {token, order});
            } else {
                log.warn ('Cluster discovery has not been initialized.');
            }
        } else {
            ChallengeResponses.emit (token, order);
        }
    },

    advertise: (advertisement) => {
        if (discover && discover instanceof Discover) {
            discover.advertise (advertisement);
            log.debug (`Set cluster discover advertisement to ${advertisement}.`);
        }
    },

    isMaster: () => {
        return isMaster;
    },

    stop: () => {
        if (discover && discover instanceof Discover) {
            log.info ('Stopping cluster auto-discovery...');
            discover.stop ();
        }
        rqlited.kill ();
    }
}