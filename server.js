"use strict";

const log = require ('./logger.js');

const fs = require ('fs');
const https = require ('https');
const tls = require ('tls');
const os = require ('os');
const rateLimit = require ('http-ratelimit');
const memoize = require ('nano-memoize');
const bcrypt = require ('bcryptjs');
const compare = require ('tsscmp');
const generateCertificate = require ('./generateCertificate.js');
const Redis = require ('ioredis')

const Proxy = require ('./proxy.js');

// initializations

const redis = new Redis ({
    host: process.env.AGASSI_REDIS_HOST,
    port: process.env.AGASSI_REDIS_PORT
});

const compareHash = memoize (bcrypt.compare, {maxAge: 1000 * 60 * 5}); // locally cache authentication(s)
const dbGet = memoize (redis.get, {maxAge: 1000 * 60 * 1}); // cache cert for 1 minutes
const dbHGetAll = memoize (redis.hgetall, {maxAge: 1000 * 60 *1}); // cache vhost for 1 minute

const defaultCert = generateCertificate ();

module.exports = https.createServer ({
    SNICallback: async (domain, callback) => {
        // get latest cert
        const queryResponse = await dbGet (`cert${process.env.AGASSI_ACME_PRODUCTION ? '' : '.staging'}:${domain}`);

        if (queryResponse) {
            // got cert
            log.debug (`got certificate for ${domain} from redis`);
            return callback (null, tls.createSecureContext ({
                key: fs.readFileSync (process.env.AGASSI_DEFAULT_KEY_FILE),
                cert: queryResponse
            }));
        } else {
            // did not get cert, use default
            log.warn (`no certificate found for ${domain}`);
            return callback (null, false);
        }
    },
    key: fs.readFileSync (process.env.AGASSI_DEFAULT_KEY_FILE),
    cert: defaultCert
}, async (request, response) => {
    const requestURL = new URL (request.url, `https://${request.headers.host}`);
    const virtualHost = await dbHGetAll (`vhost:${requestURL.hostname}`);
    // if it doesn't have .options it doesn't have a target or forward
    if (!virtualHost.options) {
        log.trace (`no virtual host found for domain ${requestURL.hostname}`);
        response.writeHead(404, {
            'Content-Type': 'text/plain'
        });
        response.end (`Could not find virtual host for domain ${requestURL.hostname}`);
        return;
    }
    virtualHost.options = JSON.parse (virtualHost.options);

    log.trace (`got virtual host for domain ${requestURL.hostname}`);

    // parse proxy options
    // basic auth protected host
    if (virtualHost.auth) {
        log.trace ('auth required');
        // auth required but not provided
        if (!request.headers.authorization) {
            // prompt for password in browser
            log.trace ('prompting password');
            response.writeHead (401, { 'WWW-Authenticate': `Basic realm="Agassi"`});
            response.end ('Authorization is required.');
            return;
        }

        // failure rate limit reached
        if (rateLimit.isRateLimited(request, 2)) {
            log.trace ('failure rate limit reached');
            response.writeHead(429, {
                'Content-Type': 'text/plain'
            });
            response.end ('Authorization failed.');
            return;
        }

        // parse authentication header
        const requestAuth = (Buffer.from (request.headers.authorization.replace (/^Basic/, ''), 'base64')).toString ('utf-8');
        const [requestUser, requestPassword] = requestAuth.split (':');

        // parse vHost auth parameter
        const vHostAuth = (Buffer.from (virtualHost.auth, 'base64')).toString ('utf-8');
        const [virtualUser, virtualHash] = vHostAuth.split (':');


        // compare provided header with expected values
        if ((compare (requestUser, virtualUser)) && (await compareHash (requestPassword, virtualHash.trim ()))) {
            log.trace ('authentication passed, proxying request');
            Proxy.web (request, response, virtualHost.options);
        } else {
            // rate limit failed authentication
            log.trace ('authentication failed');
            rateLimit.inboundRequest (request);
            // prompt for password in browser
            response.writeHead (401, { 'WWW-Authenticate': `Basic realm="Agassi"`});
            response.end ('Authorization is required.');
        }

    } else {
        // basic auth not required
        log.trace ('athentication not required, proxying');
        Proxy.web (request, response, virtualHost.options);
    }
})
.once ('listening', rateLimit.init)
.on ('listening', () => {
    log.info ('https server started');
})
.on ('close', () => {
    log.info ('https server stopped');
})
