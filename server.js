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
const { Etcd3 } = require ('etcd3');
const Proxy = require ('./proxy.js');
const forge = require ('node-forge');
const isValidDomain = require ('is-valid-domain');
const { isIP } = require ('node:net');

// initializations
const etcdClient = new Etcd3({
    hosts: process.env.AGASSI_ETCD_HOSTS.split (',')
});
const compareHash = memoize (bcrypt.compare, {maxAge: 1000 * 60 * 5}); // locally cache authentication(s)
const cache = new Map ();

// generate default key, certificate and sign it
log.info ('generating default certificate...');
const pemKey = fs.readFileSync (process.env.AGASSI_DEFAULT_KEY_FILE);
const privateKey = forge.pki.privateKeyFromPem (pemKey);
log.trace ('read private key');
const publicKey = forge.pki.setRsaPublicKey (privateKey.n, privateKey.e);
const cert = forge.pki.createCertificate ();
log.debug ('certificate successfully created');
// configure the certificate
cert.publicKey = publicKey;
cert.validity.notBefore = new Date ()
// set validity to 128 years;
cert.validity.notAfter = new Date ();
cert.validity.notAfter.setFullYear (cert.validity.notBefore.getFullYear() + 128);
cert.setSubject ([{
    name: 'commonName',
    value: `${os.hostname ()}.invalid`
}]);
// sign the certificate
log.info ('signing certificate...');
cert.sign (privateKey, forge.md.sha256.create ());
log.trace ('certificate signed');
const pemDefaultCert = Buffer.from (forge.pki.certificateToPem (cert));

module.exports = https.createServer ({
    SNICallback: async (domain, callback) => {
        // get latest cert
        let certPath = `/agassi/certificates/${process.env.AGASSI_ACME_PRODUCTION ? 'production' : 'staging'}/${domain}`;
        let authorizedCert = null;
        // try the cache
        let cachedCert = cache.get (certPath);
        if (cachedCert) {
            // found a cert in the cache
            log.trace (`got cached cert for domain ${domain}`);
            authorizedCert = cachedCert;
            return callback (null, tls.createSecureContext ({
                key: pemKey,
                cert: authorizedCert
            }));
        } else { // no cached cert
            // try from etcd
            authorizedCert = await etcdClient.get (certPath);
            if (authorizedCert) { // got a cert fom etcd
                // cache the cert from etcd
                log.trace (`got cert for domain ${domain} from etcd, caching...`);
                cache.set (certPath, authorizedCert);
                log.trace ('set cert in cache');
                return callback (null, tls.createSecureContext ({
                    key: pemKey,
                    cert: authorizedCert
                }));
            } else { // no cert from etcd or cache
                log.trace (`no certificate found for ${domain}`);
                return callback (null, tls.createSecureContext ({
                    key: pemKey,
                    cert: pemDefaultCert
                }));
            }
        }
    },
    key: pemKey,
    cert: pemDefaultCert
}, async (request, response) => {
    const requestURL = new URL (request.url, `https://${request.headers.host}`);
    const vHostPath = `/agassi/virtual-hosts/v0/${requestURL.hostname}`;
    // discard invalid domains and IP addresses
    if (!isValidDomain (requestURL.hostname, { subdomain: true }) || isIP (requestURL.hostname)) { 
        return;
    }
    log.trace (`received request for domain ${requestURL.hostname}`)
    let virtualHost = null;
    // check cache for virtual host
    log.trace ('checking cache for virtual host...');
    virtualHost = cache.get (vHostPath);
    if (!virtualHost) { // no vHost in cache 
        log.trace (`virtual host ${requestURL.hostname} not found in cache`);
        log.trace (`checking store for virtual host for ${requestURL.hostname}...`);
        // this will set virtualHost to null (again) if there is no vHost in etcd
        virtualHost = await etcdClient.get (vHostPath);
        if (virtualHost) { // got virtual host from etcd
            log.trace (`got virtual host for domain from etcd`);
            // parse the virtual host from etcd
            log.trace ('parsing virtual host from etcd...');
            virtualHost = JSON.parse (virtualHost)
            log.trace ('parsed virtual host');
            log.trace ('cacheing virtual host...');
            // set cache to parsed virtual host so that we don't parse it again
            cache.set (vHostPath, virtualHost);
            log.trace ('set virtual host in cache');
        }
    }
    // still don't have virtual host
    // if it doesn't have .options it doesn't have a target or forward
    if (!virtualHost || !virtualHost.options) {
        log.trace (`no target found for domain ${requestURL.hostname}`);
        response.writeHead(404, {
            'Content-Type': 'text/plain'
        });
        response.end (`Could not find virtual host for domain ${requestURL.hostname}`);
        return;
    }
    // parse proxy options
    // basic auth protected host
    if (virtualHost.authentication) {
        log.trace ('authentication required for virtual host', virtualHost.domain);
        // authorization required but not provided
        if (!request.headers.authorization) {
            // prompt for password in browser
            log.trace ('prompting password');
            response.writeHead (401, { 'WWW-Authenticate': `Basic realm="process.env.AGASSI_AUTH_REALM"`});
            response.end ('Authentication is required.');
            return;
        }

        // failure rate limit reached
        if (rateLimit.isRateLimited(request, 2)) {
            log.trace ('failure rate limit reached');
            response.writeHead(429, {
                'Content-Type': 'text/plain'
            });
            response.end ('Authentication failed.');
            return;
        }

        // parse authentication header
        const requestAuth = (Buffer.from (request.headers.authorization.replace (/^Basic/, ''), 'base64')).toString ('utf-8');
        const [requestUser, requestPassword] = requestAuth.split (':');

        // parse vHost authorization parameter
        const vHostAuth = (Buffer.from (virtualHost.authentication, 'base64')).toString ('utf-8');
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
            response.writeHead (401, { 'WWW-Authenticate': `Basic realm="process.env.AGASSI_AUTH_REALM"`});
            response.end ('Authorization is required.');
        }

    } else {
        // basic auth not required
        log.trace ('athentication not required, proxying');
        Proxy.web (request, response, virtualHost.options);
    }
})
.once ('listening', async () => {
    log.info ('initializing rate limiter...');
    rateLimit.init ();
    log.trace ('rate limiter initialized');

    log.info ('initializing cache...');
    let prefix = '/agassi/';
    let allAgassi = await etcdClient.getAll().prefix(prefix).exec ();
    log.debug (`cacheing ${allAgassi.kvs.length} agassi services and certificates...`);
    for (let kv of allAgassi.kvs) {
        let key = kv.key.toString();
        let servicePrefix = '/agassi/virtual-hosts/v0/';
        let certPrefix = `/agassi/certificates/${process.env.AGASSI_ACME_PRODUCTION ? 'production' : 'staging'}/`;
        let value = null;
        if (key.startsWith (servicePrefix)) {
            value = JSON.parse(kv.value);
        }
        if (key.startsWith (certPrefix)) {
            value = kv.value;
        }
        cache.set (key, value);
        log.trace ('cached', key);
    }
    log.trace (`cached ${allAgassi.kvs.length} agassi services and certificates`);
    log.info ('creating watcher on prefix ' + prefix + ' since revision ' + allAgassi.header.revision + '...');
    etcdClient.watch ().prefix(prefix).startRevision(allAgassi.header.revision).create().then (watcher => {
        log.info ('watcher created successfully');
        watcher.on ('put', res => {
            let key = res.key.toString();
            log.trace ('put event received for key', key);
            let servicePrefix = '/agassi/virtual-hosts/v0/';
            let certPrefix = `/agassi/certificates/${process.env.AGASSI_ACME_PRODUCTION ? 'production' : 'staging'}/`;
            let value = null;
            if (key.startsWith (servicePrefix)) {
                value = JSON.parse(res.value);
            }
            if (key.startsWith (certPrefix)) {
                value = res.value;
            }
            cache.set (key, value);
            log.trace ('cached', key);
        });
        watcher.on ('delete', res => {
            let key = res.key.toString ();
            log.trace ('delete event received for key', key);
            cache.delete (key);
        });
    });
})
.on ('listening', () => {
    log.info ('https server started');
})
.on ('close', () => {
    log.warn ('https server stopped');
});
