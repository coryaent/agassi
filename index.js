"use strict";
require ('dotenv').config ();

// dependencies
const { v4: uuidv4 } = require ('uuid');
const print = require ('./print.js');
const fs = require ('fs');
const bcrypt = require ('bcryptjs');
const acme = require ('acme-client');
const Etcd = require ('node-etcd');
const bluebird = require ('bluebird'); bluebird.promisifyAll(Etcd.prototype);
const etcdLeader = require ('etcd-leader');
const dolphin = require ('dolphin')();
const Docker = require ('dockerode'); const docker = new Docker ();
const httpProxy = require ('http-proxy');
const http = require ('http');
const https = require ('https');
const tls = require ('tls');
const memoize = require ('fast-memoize');
const crypto = require ('crypto'); const md5 = (x) => crypto.createHash('md5').update(x).digest('hex');

const uuid = uuidv4();
print (`starting process with uuid ${uuid}...`);

// load keys for HTTPS server and Let's Encrypt
print (`loading certificates...`);
const defaultKey = fs.readFileSync (process.env.DEFAULT_KEY);
const defaultCert = fs.readFileSync (process.env.DEFAULT_CRT);
const acmeKey = fs.readFileSync (process.env.ACME_KEY);

// initialize caches of virtual hosts, SNI secure contexts, and basic authentication
const vHosts = new Map ();
const compareHash = memoize (bcrypt.compare); // memoize for 1 hr.

// acme client
const client = new acme.Client({
    directoryUrl: process.env.STAGING == 'true' ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production,
    accountKey: acmeKey
});
print (`${ process.env.STAGING == 'true' ? 'using staging environment...':'using production environment...'}`);

// parse etcd hosts
print (`parsing etcd hosts...`);
const etcdHosts = process.env.ETCD.split (',');
for (let i = 0; i < etcdHosts.length; i++) {
    etcdHosts[i] = etcdHosts[i].trim();
};
print (`connecting to etcd...`);
const etcd = new Etcd (etcdHosts);

// create requisite directories for watchers
const challengeDir = typeof process.env.CHALLENGE_DIR === 'string' ? process.env.CHALLENGE_DIR : '/challenges';
etcd.mkdirSync (challengeDir);
const certDir = typeof process.env.CERT_DIR === 'string' ? process.env.CERT_DIR : '/certs';
etcd.mkdirSync (certDir);
const vHostDir = typeof process.env.VHOST_DIR === 'string' ? process.env.VHOST_DIR : '/virtual-hosts';
etcd.mkdirSync (vHostDir);

// elect and monitor proxy leader
const electionDir = typeof process.env.ELECTION_DIR === 'string' ? process.env.ELECTION_DIR : '/leader';
print (`electing leader using key ${electionDir}...`);
const election = etcdLeader(etcd, electionDir, uuid, 10).start();
var isLeader = false;
election.on ('elected', async () => {
    isLeader = true;
    print (`this node ${uuid} elected as leader`);
    print (`initializing Let's Encrypt account...`);
    await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [process.env.EMAIL.startsWith('mailto:') ? process.env.EMAIL : `mailto:${process.env.EMAIL}`]
    });
});
election.on ('unelected', () => {
    isLeader = false;
    print (`this node ${uuid} is no longer leader`);
});
election.on ('leader', (node) => {
    print (`node ${node} elected as leader`);
})
election.on ('error', (error) => {
    print (`ERROR: ${error}`);
});

// listen to docker socket for new containers
dolphin.events({})
.on ('event', async (event) => {
    // only leader hayndles new services
    if (isLeader) {
        // on service creation
        if (event.Type === 'service' && event.Action === 'create') {
            print (`detected new docker service ${event.Actor.ID}`);
            const service = await docker.getService (event.Actor.ID).inspect();
            // check that the service has the requisite label(s)
            if (service.Spec.Labels.VIRTUAL_HOST) {
                // parse virtual host
                const virtualURL = new URL (service.Spec.Labels.VIRTUAL_HOST);
                print (`new service VIRTUAL_HOST parsed as ${virtualURL.toString()}`);

                // create virtual host w/ options
                const virtualHost = {};
                virtualHost.options = {};
                virtualHost.options.target = `${virtualURL.protocol}//${service.Spec.Name}:${virtualURL.port}`;
                print (`target set to ${virtualURL.protocol}//${service.Spec.Name}:${virtualURL.port}`);
                // check if auth is required
                if (service.Spec.Labels.VIRTUAL_AUTH) {
                    print (`found VIRTUAL_AUTH for ${service.Spec.Name}`);
                    virtualHost.auth = service.Spec.Labels.VIRTUAL_AUTH;
                    print (service.Spec.Labels.VIRTUAL_AUTH);
                } else {
                    print (`VIRTUAL_AUTH not found for ${service.Spec.Name}`);
                };
                print (`adding virtual host to etcd...`);
                await etcd.setAsync (`${vHostDir}/${virtualURL.hostname}`,
                    JSON.stringify (virtualHost)
                );

                // place order for signed certificate
                print (`ordering Let's Encrypt certificate for ${virtualURL.hostname} ...`);
                const order = await client.createOrder({
                    identifiers: [
                        { type: 'dns', value: virtualURL.hostname },
                    ]
                });

                // get http authorization token and response
                print (`getting authorization token for ${virtualURL.hostname} ...`);
                const authorizations = await client.getAuthorizations(order);
                const httpChallenge = authorizations[0]['challenges'].find (
                    (element) => element.type === 'http-01');
                const httpAuthorizationToken = httpChallenge.token;
                const httpAuthorizationResponse = await client.getChallengeKeyAuthorization(httpChallenge);

                // add challenge and response to etcd
                print (`setting token and response for ${virtualURL.hostname} in etcd...`);
                await etcd.setAsync (`${challengeDir}/${httpAuthorizationToken}`, // key
                    JSON.stringify({ // etcd value
                        domain: virtualURL.hostname,
                        order: order,
                        challenge: httpChallenge,
                        response: httpAuthorizationResponse
                    }
                ), { ttl: 864000 }); // 10-day expiration
            };
        };
    };
})
.on ('error', (error) => {
    print (`ERROR: ${error}`);
});

// watch for new ACME challenges
etcd.watcher (challengeDir, null, {recursive: true})
.on ('set', async (event) => {

    // only the leader communicates that a challenge is ready
    print (`found new ACME challenge`);
    if (isLeader) {
        // queue the completion on the remote ACME server and wait
        print (`completing challenge and awaiting validation...`);
        const value = JSON.parse (event.node.value);
        await client.completeChallenge (value.challenge);
        await client.waitForValidStatus(value.challenge);

        // challenge is complete and valid, send cert-signing request
        print (`creating CSR for ${value.domain} ...`);
        const [key, csr] = await acme.forge.createCsr({
            commonName: value.domain
        }, defaultKey);

        // finalize the order and pull the cert
        print (`finalizing order and downloading cert for ${value.domain} ...`);
        await client.finalizeOrder(value.order, csr);
        const cert = await client.getCertificate(value.order);

        // add cert to etcd with expiration
        print (`adding cert to etcd...`);
        await etcd.setAsync (`${certDir}/${md5(cert)}`, 
            JSON.stringify ({
                cert: cert,
                domain: value.domain
            }
        ), {ttl: 7776000}); // 90-day ttl

        // update the virtual host
        print (`updating virtual host in etcd...`);
        const virtualHost = JSON.parse ( (await etcd.getAsync (`${vHostDir}/${value.domain}`) ).node.value );
        virtualHost.cert = cert;
        await etcd.setAsync (`${vHostDir}/${value.domain}`, 
            JSON.stringify (virtualHost)
        );

    };
})
.on ('error', (error) => {
    print (`ERROR: ${error}`);
});

// create HTTP server to answer challenges and redirect
http.createServer (async (request, response) => {
    // check request path
    print ('received http request');
    const requestURL = new URL(request.url, `http://${request.headers.host}`);
    print (requestURL.toString());
    if (requestURL.pathname && requestURL.pathname.startsWith('/.well-known/acme-challenge/')) {

        // process ACME validation
        const token = requestURL.pathname.replace('/.well-known/acme-challenge/', '');
        print (`fetching token response from etcd for token ${token} ...`);
        const value = (await etcd.getAsync (`${challengeDir}/${token}`)).node.value;
        const challengeResponse = JSON.parse (value).response;
        print (`responding to challenge request...`);
        response.writeHead(200, {
            'Content-Type': 'text/plain'
        });
        response.write (challengeResponse);
        response.end();

    } else {

        // redirect to https
        const redirectLocation = "https://" + request.headers['host'] + request.url;
        print (`redirecting to ${redirectLocation} ...`);
        response.writeHead(301, {
            "Location": redirectLocation
        });
        response.end();

    };
})
.on ('error', (error) => print (error))
.listen (80);

// watch for new virtual hosts
etcd.watcher (vHostDir, null, {recursive: true})
.on ('set', async (event) => {
    print (`found new virtual host in etcd`);
    const vHostDomain = event.node.key.replace (`${vHostDir}/`, '');
    const vHost = JSON.parse (event.node.value);
    print (`caching virtual host for ${vHostDomain} ...`);
    vHosts.set (vHostDomain, vHost);
})
.on ('error', (error) => {
    print (`ERROR: ${error}`);
});


// create proxy, HTTP and HTTPS servers
const proxy = httpProxy.createProxyServer({})
.on ('error', (error)  => print (error));

https.createServer ({
    SNICallback: (domain, callback) => {
        print (`calling SNICallBack...`);
        if (vHosts.get(domain) && vHosts.get(domain).cert) {
            print (`found SNI callback for ${domain}`);
            return callback (null, tls.createSecureContext({
                key: defaultKey,
                cert: vHosts.get(domain).cert
            }));
        } else {
            print (`could not find SNI callback for ${domain}`);
            return callback (null, false);
        };
    },
    key: defaultKey,
    cert: defaultCert
}, async (request, response) => {
    print ('received new https request');
    const requestURL = new URL(request.url, `https://${request.headers.host}`);
    print (requestURL.hostname);
    const virtualHost = vHosts.get (requestURL.hostname);
    // basic auth protected host
    if (virtualHost.auth) {
        print (`basic auth required...`);
        // auth required but not provided
        if (!request.headers.authorization) {
            // prompt for password in browser
            response.writeHead(401, { 'WWW-Authenticate': `Basic realm="${requestURL.hostname}"`});
            response.end ('Authorization is needed');
            return;  
        };

        // parse authentication header
        const requestAuth = (new Buffer (request.headers.authorization.replace(/^Basic/, ''), 'base64')).toString('utf-8');
        print (requestAuth);
        const [requestUser, requestPassword] = requestAuth.split (':');

        // parse vHost auth parameter
        const [virtualUser, virtualHash] = virtualHost.auth.split (':');
        print (virtualHost.auth);

        // compare provided header with expected values
        if (requestUser === virtualUser && (await compareHash (requestPassword, virtualHash))) {
            print (`basic auth passed`);
            proxy.web (request, response, virtualHost.options);
        };

        response.writeHead(401, { 'WWW-Authenticate': `Basic realm="${requestURL.hostname}"`});
        response.end ('Authorization is needed');

    } else {
        // basic auth not required 
        proxy.web (request, response, virtualHost.options);
    };
})
.on ('error', (error) => print (error))
.listen(443);

// periodically check for expriring certificates
setInterval (async () => {

}, 86400); // run once per day