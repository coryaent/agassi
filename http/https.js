"use strict";


const Config = require ('../config.js');
const log = require ('../logger.js');
const rqlite = require ('../rqlite/rqlite.js');

const https = require ('https');
const tls = require ('tls');
const rateLimit = require ('http-ratelimit');
const memoize = require ('nano-memoize');
const bcrypt = require ('bcryptjs');
const compare = require ('tsscmp');

const Proxy = require ('./proxy.js');

// initializations
const compareHash = memoize (bcrypt.compare, {maxAge: 1000 * 60 * 5}); // locally cache authentication(s)

const base64RegEx = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
// const bcryptRegEx = /\$2[xy]\$/;

const Server = https.createServer ({
    SNICallback: async (domain, callback) => {
        // get latest cert
        const queryResponse = await rqlite.dbQuery (`SELECT certificate FROM certificates
        WHERE domain = '${domain}' ORDER BY expiration DESC LIMIT 1;`, null);

        if (queryResponse.results.length > 0) {
            // got cert
            log.debug (`Get certificate for ${domain} for database in ${queryResponse.time}.`);
            return callback (null, tls.createSecureContext ({
                key: Config.defaultKey,
                cert: queryResponse.results[0].certificate
            }));
        } else {
            // did not get cert, use default
            log.warn (`No certificate found for ${domain}.`);
            return callback (null, false);
        }
    },
    key: Config.defaultKey,
    cert: Config.defaultCert
}, async (request, response) => {
    const requestURL = new URL (request.url, `https://${request.headers.host}`);
    const queryResponse = await rqlite.dbQuery (`SELECT protocol, hostname, port, auth, options FROM services
    WHERE domain = '${requestURL.hostname}';`, null);

    // if there is no matching agassi service
    if (!queryResponse.results.length > 0) {
        log.debug (`No virtual host found for domain ${requestURL.hostname}.`);
        return;
    }

    log.debug (`Got virtual host for domain ${requestURL.hostname} in ${queryResponse.time}.`);

    // parse proxy options
    const virtualHost = queryResponse.results[0];
    const proxyOptions = JSON.parse (virtualHost.options)
    if (!proxyOptions.target && !proxyOptions.forward) {
        proxyOptions.target = `${virtualHost.protocol}://${virtualHost.hostname}:${virtualHost.port}`;
    }

    // basic auth protected host
    if (virtualHost.auth) {
        // auth required but not provided
        if (!request.headers.authorization) {
            // prompt for password in browser
            response.writeHead (401, { 'WWW-Authenticate': `Basic realm="${Config.realm}"`});
            response.end ('Authorization is required.');
            return;
        }

        // failure rate limit reached
        if (rateLimit.isRateLimited(request, 2)) {
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
        const vHostAuth = base64RegEx.test (virtualHost.auth) ? // test if the provided agassi.auth is base64 encoded
            (Buffer.from (virtualHash.auth, 'base64')).toString ('utf-8') : virtualHost.auth;

        const [virtualUser, virtualHash] = vHostAuth.split (':');

        // compare provided header with expected values
        if ((compare (requestUser, virtualUser)) && (await compareHash (requestPassword, virtualHash))) {
            Proxy.web (request, response, proxyOptions);
        } else {
            // rate limit failed authentication
            rateLimit.inboundRequest (request);
            // prompt for password in browser
            response.writeHead (401, { 'WWW-Authenticate': `Basic realm="${Config.realm}"`});
            response.end ('Authorization is required.');
        }

    } else {
        // basic auth not required
        Proxy.web (request, response, proxyOptions);
    }
}).on ('listening', () => {
    log.info ('HTTPS server started.');
}).on ('close', () => {
    log.info ('HTTPS server stopped.');
});

module.exports = {
    Server,

    start: () => {
        if (Server && !Server.listening) {
            log.info ('Starting HTTPS server...');
            Server.listen (443, null, (error) => {
                if (error) {
                    throw error;
                }
                log.debug ('Initializing HTTPS rate limiter...');
                rateLimit.init (1, true); // 1 minute, using reverse proxy
            })
        }
    },

    stop: () => {
        if (Server && Server.listening) {
            log.info ('Stopping HTTPS server...');
            Server.stop ();
        }
    }
};
