"use strict";

const log = require ('./logger.js');

const Redis = require ('ioredis')
const Docker = require ('dockerode');

// check argv
if (!process.argv.includes ('--client') && !process.argv.includes ('--server')) {
    log.fatal ('must specify client or server mode');
    process.exit (1);
}
if (process.argv.includes ('--client') && process.argv.includes ('--server')) {
    log.fatal ('cannot run as client and server simultaneously');
    process.exit (1);
}

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

    const { isAgassiService, getAuth, getVHost, getOptions } = require ('./agassiService.js');
    const fetchCertificate = require ('./fetchCertificate.js');

    docker.getEvents ({ filters: { type: ["service"]}}).then (events => {
        events.on ('data', async (data) => {
            let event = JSON.parse (data);
            log.trace (event);
            if (event.Action == 'create' || event.Action == 'update') {
                let service = await docker.getService (event.Actor.ID);
                service = await service.inspect ();
                log.trace (service);
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
                    // need to fetch and add the certificate
                    let [cert, expiration] = await fetchCertificate (getVHost (service));
                    log.debug (cert);
                    log.debug (expiration);
                    await redis.set (`cert:${getVHost (service)}`, cert, 'EX', expiration);
                }
            }
            if (event.Action == 'remove') {
                // first get the vhost
                let vHost = await redis.get ('service:' + event.Actor.ID);
                log.debug (vHost);
                let res = await redis.del ('vhost:' + vHost);
                log.debug (res);
            }
        });
    });
}

// if server start HTTPS server
if (process.argv.includes ('--server')) {
    const https = require ('https');
    const tls = require ('tls');
    const forge = require ('node-forge');
    const os = require ('os');
    const rateLimit = require ('http-ratelimit');
    const memoize = require ('nano-memoize');
    const bcrypt = require ('bcryptjs');
    const compare = require ('tsscmp');

    const Proxy = require ('./proxy.js');

    // initializations
    const compareHash = memoize (bcrypt.compare, {maxAge: 1000 * 60 * 5}); // locally cache authentication(s)

    const base64RegEx = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    // const bcryptRegEx = /\$2[xy]\$/;

    function generateDefaultCert () {
        const privateKey = forge.pki.privateKeyFromPem (Config.defaultKey);
        const publicKey = forge.pki.setRsaPublicKey (privateKey.n, privateKey.e);

        const cert = forge.pki.createCertificate ();
        cert.publicKey = publicKey;
        cert.validity.notBefore = new Date ();
        cert.validity.notAfter = new Date ();
        cert.validity.notAfter.setFullYear (cert.validity.notBefore.getFullYear() + 128);
        cert.setSubject ([{
            name: 'commonName',
            value: `${os.hostname ()}.invalid`
        }]);
        cert.sign (privateKey);

        return Buffer.from (forge.pki.certificateToPem (cert));
    }

    const defaultCert = generateDefaultCert ();

    module.exports = https.createServer ({
        SNICallback: async (domain, callback) => {
            // get latest cert
            const queryResponse = await rqlite.dbQuery (`SELECT certificate FROM certificates
            WHERE domain = '${domain}' ORDER BY expiration DESC LIMIT 1;`, null);

            if (queryResponse.results.length > 0) {
                // got cert
                log.debug (`Got certificate for ${domain} from database in ${queryResponse.time * 1000} ms.`);
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
        cert: defaultCert
    }, async (request, response) => {
        const requestURL = new URL (request.url, `https://${request.headers.host}`);
        const queryResponse = await rqlite.dbQuery (`SELECT protocol, hostname, port, auth, options FROM services
        WHERE domain = '${requestURL.hostname}';`, null);

        // if there is no matching agassi service
        if (!queryResponse.results.length > 0) {
            log.debug (`No virtual host found for domain ${requestURL.hostname}.`);
            return;
        }

        log.debug (`Got virtual host for domain ${requestURL.hostname} in ${queryResponse.time * 1000} ms.`);

        // parse proxy options
        const virtualHost = queryResponse.results[0];
        const proxyOptions = JSON.parse (virtualHost.options)
        if (!proxyOptions.target && !proxyOptions.forward) {
            proxyOptions.target = `${virtualHost.protocol}://${virtualHost.hostname}:${virtualHost.port}`;
        }

        // basic auth protected host
        if (virtualHost.auth && virtualHost.auth != 'null') {
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
                (Buffer.from (virtualHost.auth, 'base64')).toString ('utf-8') : virtualHost.auth;

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
    })
    .once ('listening', rateLimit.init)
    .on ('listening', () => {
        log.info ('HTTPS server started.');
    }).on ('close', () => {
        log.info ('HTTPS server stopped.');
    });
}
