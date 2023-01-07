"use strict";

const log = require ('./logger.js');

// check argv
if (!process.argv.includes ('--client') && !process.argv.includes ('--server')) {
    log.fatal ('must specify client or server mode');
    process.exit (1);
}
if (process.argv.includes ('--client') && process.argv.includes ('--server')) {
    log.fatal ('cannot run as client and server simultaneously');
    process.exit (1);
}

const isValidPath = require ('is-valid-path');
const isValidEmail = require ('is-valid-email');
const isValidDomain = require ('is-valid-domain');

if (!process.env.AGASSI_DEFAULT_KEY_FILE || !isValidPath (process.env.AGASSI_DEFAULT_KEY_FILE)) {
    log.fatal ('AGASSI_DEFAULT_KEY_FILE is either not provided or invalid');
    process.exit (1);
}

if (!process.env.AGASSI_REDIS_HOST) {
    log.fatal ('AGASSI_REDIS_HOST is must be defined');
    process.exit (1);
}

const Redis = require ('ioredis')
const Docker = require ('dockerode');

// initialization
const redis = new Redis({
    host: process.env.AGASSI_REDIS_HOST,
    port: process.env.AGASSI_REDIS_PORT
});

const docker = new Docker ({
    host: process.env.AGASSI_DOCKER_HOST,
    port: process.env.AGASSI_DOCKER_PORT,
    version: process.env.AGASSI_DOCKER_API_VERSION
});

// if client start monitoring docker socket
if (process.argv.includes ('--client')) {
    if (!process.env.AGASSI_DOCKER_HOST) {
        log.fatal ('AGASSI_DOCKER_HOST must be defined');
        process.exit (1);
    }
    if (!process.env.AGASSI_LABEL_PREFIX) {
        log.fatal ('AGASSI_LABEL_PREFIX is required');
        process.exit (1);
    }
    if (!process.env.AGASSI_LETS_ENCRYPT_EMAIL || !isValidEmail (process.env.AGASSI_LETS_ENCRYPT_EMAIL)) {
        log.fatal ('AGASSI_LETS_ENCRYPT_EMAIL is either not provided or invalid');
        process.exit (1);
    }
    if (!process.env.AGASSI_MAILINABOX_EMAIL || !isValidEmail (process.env.AGASSI_MAILINABOX_EMAIL)) {
        log.fatal ('AGASSI_MAILINABOX_EMAIL is either not defined or not valid');
        process.exit (1);
    }
    if (!process.env.AGASSI_MAILINABOX_PASSWORD_FILE || !isValidPath (process.env.AGASSI_MAILINABOX_PASSWORD_FILE)) {
        log.fatal ('AGASSI_MAILINABOX_PASSWORD_FILE is either not provided or not valid');
        process.exit (1);
    }

    if (!process.env.AGASSI_TARGET_CNAME || !isValidDomain (process.env.AGASSI_TARGET_CNAME, { subdomain: true })) {
        log.fatal ('AGASSI_TARGET_CNAME is either undefined or invalid');
        process.exit (1);
    }

    const { isAgassiService, getAuth, getVHost, getOptions } = require ('./agassiService.js');
    const fetchCertificate = require ('./fetchCertificate.js');
    const setDNSRecord = require ('./dnsRecord.js');

    // pull existing services
    docker.listServices ().then (async function (services) {
        // console.log (services);
        for (let id of services.map (service => service.ID)) {
            let service = await docker.getService (id);
            service = await service.inspect ();
            if (isAgassiService (service)) {
                log.debug ('found agassi service')
                // `SET service:[service id] [vhost]`
                log.debug ('setting service -> vhost');
                await redis.set (`service:${id}`, getVHost (service) );
                log.debug ('setting vhost hash');
                await redis.hset (`vhost:${getVHost (service)}`, 'auth', getAuth (service), 'options', JSON.stringify (getOptions (service)));
                if (!redis.hexists (`cert:${getVHost(service)}`, 'cert')) {
                    // need to fetch and add the certificate
                    let [cert, expiration] = await fetchCertificate (getVHost (service));
                    // log.debug (cert);
                    log.debug (expiration);
                    log.debug ('adding cert to redis');
                    // Math.floor (new Date (expiration).getTime ()/ 1000)
                    await redis.hset (`cert:${getVHost (service)}`, 'cert', cert, 'expiration', expiration);
                // set dns record
                await setDNSRecord (getVHost (service));
                }
            }
        }
    });


    // subscribe to events
    // see https://github.com/apocas/dockerode/issues/635 to close listeners (to gracefully shutdown)
    docker.getEvents ({ filters: { type: ["service"]}}).then (events => {
        events.on ('data', async (data) => {
            let event = JSON.parse (data);
            log.trace (event);
            if (event.Action == 'create' || event.Action == 'update') {
                let service = await docker.getService (event.Actor.ID);
                service = await service.inspect ();
                log.debug ('id: ' + event.Actor.ID);
                log.debug ('vhost: ' + getVHost (service));
                log.debug ('auth: ' + getAuth (service));
                log.debug ('options:', getOptions (service));
                // if we have an agassi service
                if (isAgassiService (service)) {
                    log.debug ('found agassi service')
                    // `SET service:[service id] [vhost]`
                    log.debug ('setting service -> vhost');
                    await redis.set (`service:${event.Actor.ID}`, getVHost (service) );
                    log.debug ('setting vhost hash');
                    await redis.hset (`vhost:${getVHost (service)}`, 'auth', getAuth (service), 'options', JSON.stringify (getOptions (service)));
                    if (!redis.hexists (`cert:${getVHost(service)}`, 'cert')) {
                        // need to fetch and add the certificate
                        let [cert, expiration] = await fetchCertificate (getVHost (service));
                        // log.debug (cert);
                        log.debug (expiration);
                        log.debug ('adding cert to redis');
                        // Math.floor (new Date (expiration).getTime ()/ 1000)
                        await redis.hset (`cert:${getVHost (service)}`, 'cert', cert, 'expiration', expiration);

                    }
                    log.debug ('found cert');
                    log.debug ('setting dns record');
                    await setDNSRecord (getVHost (service));
                }
            }
            if (event.Action == 'remove') {
                // first get the vhost
                log.debug ('removing vhost');
                let vHost = await redis.get ('service:' + event.Actor.ID);
                log.debug (vHost);
                let res = await redis.del ('vhost:' + vHost);
                log.debug (res);
                log.debug ('removing service');
                res = await redis.del ('service:' + event.Actor.ID);
                log.debug (res);
            }
        });
    });
}

// if server start HTTPS server
if (process.argv.includes ('--server')) {
    const fs = require ('fs');
    const https = require ('https');
    const tls = require ('tls');
    const os = require ('os');
    const rateLimit = require ('http-ratelimit');
    const memoize = require ('nano-memoize');
    const bcrypt = require ('bcryptjs');
    const compare = require ('tsscmp');
    const generateCertificate = require ('./generateCertificate.js');

    const Proxy = require ('./proxy.js');

    // initializations
    const compareHash = memoize (bcrypt.compare, {maxAge: 1000 * 60 * 5}); // locally cache authentication(s)

    const base64RegEx = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    // const bcryptRegEx = /\$2[xy]\$/;

    const defaultCert = generateCertificate ();

    https.createServer ({
        SNICallback: async (domain, callback) => {
            // get latest cert
            const queryResponse = await redis.hget (`cert:${domain}`, 'cert');

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
        const virtualHost = await redis.hgetall (`vhost:${requestURL.hostname}`);
        // if it doesn't have .options it doesn't have a target or forward
        if (!virtualHost.options) {
            log.trace (`no virtual host found for domain ${requestURL.hostname}`);
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
    .listen (443);
}
