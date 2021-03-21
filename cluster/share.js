"use strict";

const http = require ('http');
const querystring = require ('querystring');

const Cache = require ('../cache.js');
const Certificate = require ('../certificate.js');

/*
    GET /certs?q=c4ca4238a0b923820dcc509a6f75849b&q=c81e728d9d4c2f636f067f89cc14862c... -> get specified certs
    GET /certs/all -> get all certs
    GET /certs/list -> get an array of all cert hashes
    GET /challenge?token=x -> get response to an acme challenge

    POST / -> validate then add certs in request body to cache
*/
module.exports = http.createServer (async (request, response) => {
    // request will be either a GET or a POST
    switch (request.method) {
        case 'HEAD':
        case 'GET':
            const path = request.url.substring (0, request.url.indexOf ('?'));
            switch (path) {
                case '/certs':
                    // pull certificates from cache and return
                    const query = querystring.parse (request.url.substring (request.url.indexOf ('?') + 1)).q;
                    // const certs = Cache.certificates.mget (keys);
                    response.writeHead (200, {
                        'Content-Type': 'application/json'
                    });
                    if (request.method !== 'HEAD') {
                        for (let key of query) {
                            let cert = Cache.certificates.get (key);
                            if (cert) {
                                response.write (JSON.stringify({
                                    key: cert
                                }));
                            }
                        }
                    }
                    response.end ();
                    return;
                case '/certs/all':
                    const keys =  Cache.certificates.keys ();
                    response.writeHead (200, {
                        'Content-Type': 'application/json',
                        'Conten-Length': Cache.certificates.getStats ().vsize
                    });
                    if (request.method !== 'HEAD') {
                        for (let key of keys) {
                            let cert = Cache.certificates.get (key);
                            if (cert) {
                                response.write (JSON.stringify({
                                    [key]: cert
                                }));
                            }
                        }
                    }
                    response.end ();
                    return;
                case '/certs/list':
                    // get list of all certificate hashes
                    const hashes = Cache.certificates.keys ();
                    response.writeHead (200, {
                        'Content-Type': 'application/json',
                        'Content-Length': Cache.certificates.getStats ().ksize
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
});