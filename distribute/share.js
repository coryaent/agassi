"use strict";

const http = require ('http');
const querystring = require ('querystring');
const ndjson = require ('ndjson');

const Cache = require ('../cache.js');
const Certificate = require ('../certificate.js');

/*
    GET /certs?q=c4ca4238a0b923820dcc509a6f75849b&q=c81e728d9d4c2f636f067f89cc14862c... -> get specified certs
        RETURNS new-line seperated JSON representation of certs as
        {[certHash]: body, expiration, domain}
        ...
        ...
    GET /certs/all -> get all certs
        RETURNS new-line seperated JSON strings
    GET /certs/list -> get an array of all cert hashes
        RETURNS array of strings
    GET /challenge?token=x -> get response to an acme challenge
        RETURNS a single-line string

    POST / -> validate then add certs in request body to cache
        BODY is array of certificates formatted as
        [ 
            {[certHash]: {
                body,
                expiration,
                domain
            }},
            ...
        ]
*/
module.exports = http.createServer (async (request, response) => {
    // request will be either a GET or a POST
    switch (request.method) {
        case 'HEAD':
        case 'GET':
            const path = request.url.indexOf ('?') > 0 ?
                         request.url.substring (0, request.url.indexOf ('?')) :
                         request.url;
            switch (path) {
                case '/certs':
                    // pull certificates from cache and return
                    const query = Array.isArray (querystring.parse (text.substring (text.indexOf ('?') + 1)).q) ? // already is an array
                        querystring.parse (text.substring (text.indexOf ('?') + 1)).q :                           // set query as array
                        querystring.parse (text.substring (text.indexOf ('?') + 1)).q ?                           // check if undefined
                            Array.of (querystring.parse (text.substring (text.indexOf ('?') + 1)).q) :            // not undefined, make a new array of length 1
                            null;                                                                                 // create a new array of length 0
                    // bad query
                    if (query === null) {
                        response.writeHead (400, 'Invalid or undefined query parameter(s).');
                        response.end ();
                        return;
                    }        
                    // one or more queried certs not found
                    if (!query.every (key => Cache.certificates.has (key))) {
                        response.writeHead (404);
                        response.end ();
                        return;
                    }
                    response.writeHead (200, {
                        'Content-Type': 'text/plain'
                    });
                    if (request.method !== 'HEAD') {
                        const qStream = ndjson.stringify ().pipe (response, { end: false });
                        for (let key of query) {
                            qStream.write ({
                                [key]: Cache.certificates.get (key)
                            });
                        }
                        qStream.end ();
                    }
                    response.end ();
                    return;
                case '/certs/all':
                    response.writeHead (200, {
                        'Content-Type': 'text/plain',
                        'Conten-Length': Cache.certificates.getStats ().vsize
                    });
                    if (request.method !== 'HEAD') {
                        const allStream = ndjson.stringify ().pipe (response, { end: false });
                        for (let key of Cache.certificates.keys ()) {
                            // ensure nothing has expired during this loop
                            let cert = Cache.certificates.get (key);
                            if (cert) {
                                allStream.write (JSON.stringify({
                                    [key]: cert
                                }));
                            }
                        }
                        allStream.end ();
                    }
                    response.end ();
                    return;
                case '/certs/list':
                    // get list of all certificate hashes
                    response.writeHead (200, {
                        'Content-Type': 'application/json',
                        'Content-Length': Cache.certificates.getStats ().ksize
                    });
                    if (request.method !== 'HEAD') {
                        response.write (JSON.stringify (Cache.certificates.keys ()));
                    }
                    response.end ();
                    return;
                case '/challenge':
                    // get response to an ACME challenge
                    const token = querystring.parse (request.url.substring (request.url.indexOf ('?') + 1)).token;
                    // if token is not a string then this is wrong
                    if (typeof token !== 'string') {
                        response.writeHead (400, 'Invalid or undefined token parameter.');
                        response.end ();
                        return;
                    }
                    const challengeResponse = Cache.challenges.get (token);
                    // check validity of response
                    if (typeof challengeResponse !== 'string') {
                        response.writeHead (404);
                        response.end ();
                        return;
                    }
                    // token and challengeResponse are both valid
                    response.writeHead (200, {
                        'Content-Type': 'text/plain',
                        'Content-Length': Buffer.byteLength (challengeResponse)
                    });
                    if (request.method !== 'HEAD') { 
                        response.write (challengeResponse); 
                    }
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
                            // TODO exit here
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