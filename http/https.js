"use strict";

const https = require ('https');
const tls = require ('tls');
const rateLimit = require ('http-ratelimit');
const memoize = require ('nano-memoize');
const bcrypt = require ('bcryptjs');
const compare = require ('tsscmp');
const fs = require ('fs');

const Config = require ('../config.js');
const print = require ('../print.js');
const Proxy = require ('./proxy.js');
const rqlite = require ('./rqliteOpts.js');
const Query = require ('../rqlite/query.js');

// initializations
const compareHash = memoize (bcrypt.compare, {maxAge: 1000 * 60 * 5}); // locally cache authentication(s)

module.exports = {
    server: https.createServer ({
    SNICallback: (domain, callback) => {
            if (certs.has(domain)) {
                return callback (null, tls.createSecureContext({
                    key: Config.defaultKey,
                    cert: certs.get(domain)
                }));
            } else {
                return callback (null, false);
            };
        },
        key: Config.defaultKey,
        cert: Config.defaultCert
    }, async (request, response) => {
        const requestURL = new URL(request.url, `https://${request.headers.host}`);
        let virtualHost = vHosts.get (requestURL.hostname);
        // if virtual host is not in cache
        if (!virtualHost) {
            try {
                // check for virtual host in etcd
                let vHost = await etcd.getAsync (`${vHostDir}/${requestURL.hostname}`);
                vHosts.set (requestURL.hostname, JSON.parse (vHost.value));
                virtualHost = vHosts.get (requestURL.hostname);
            } catch (error) {
                print (error.name);
                print (error.message);
            };
        };
        // if virtual host exists in cache or etcd
        if (virtualHost) {
            // basic auth protected host
            if (virtualHost.auth) {
                // auth required but not provided
                if (!request.headers.authorization) {
                    // prompt for password in browser
                    response.writeHead (401, { 'WWW-Authenticate': `Basic realm="${Config.realm}"`});
                    response.end ('Authorization is required.');
                    return;  
                };
                // failure rate limit reached
                if (rateLimit.isRateLimited(request, 2)) {
                    response.writeHead(429, {
                        'Content-Type': 'text/plain'
                    });
                    response.end ('Authorization failed.');
                    return;
                };

                // parse authentication header
                const requestAuth = (Buffer.from (request.headers.authorization.replace(/^Basic/, ''), 'base64')).toString('utf-8');
                const [requestUser, requestPassword] = requestAuth.split (':');

                // parse vHost auth parameter
                const [virtualUser, virtualHash] = virtualHost.auth.split (':');

                // compare provided header with expected values
                if ((compare(requestUser, virtualUser)) && (await compareHash (requestPassword, virtualHash))) {
                    Proxy.web (request, response, virtualHost.options);
                } else {
                    // rate limit failed authentication
                    rateLimit.inboundRequest(request);
                    // prompt for password in browser
                    response.writeHead(401, { 'WWW-Authenticate': `Basic realm="${Config.realm}"`});
                    response.end ('Authorization is required.');
                };

            } else {
                // basic auth not required 
                Proxy.web (request, response, virtualHost.options);
            };
        };
    }).once ('listening', () => {
        process.nextTick (() => {
            rateLimit.init ()
        });
    }),
    
    start: () => {
        if (!this.server.listening) {
            this.server.listen (443, null, (error) => {
                if (error) {
                    throw error;
                }
            })
        }
    },

    stop: () => {
        if (this.server.listening) {
            this.server.stop ();
        }
    }
};
