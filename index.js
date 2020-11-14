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
const dateDiff = require ('date-range-diff');

const uuid = uuidv4();
print (`starting process with uuid ${uuid}...`);

// load keys for HTTPS server and Let's Encrypt
print (`loading keys and email address...`);
const defaultKey = fs.readFileSync (process.env.DEFAULT_KEY, 'utf-8');
const defaultCert = fs.readFileSync (process.env.DEFAULT_CRT, 'utf-8');
const acmeKey = fs.readFileSync (process.env.ACME_KEY, 'utf-8');
const email = 'mailto:' + (fs.readFileSync (process.env.EMAIL, 'utf-8')).trim();
print (`using email ${email}...`);

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

// initialize caches of virtual hosts, current certificates, and basic authentication
const certs = new Map ();
const vHosts = new Map ();
const dockerServices = new Map ();
const compareHash = memoize (bcrypt.compare); // locally cache authentication(s)
// cache availability of certs
const isIterable = object =>
  object != null && typeof object[Symbol.iterator] === 'function'

const certNodes = etcd.getSync (`${certDir}`, {recursive: true});
if (isIterable (certNodes.body.node.nodes)) {
    for (let certNode of certNodes.body.node.nodes) {
        certs.set (certNode.key.replace (`${certDir}/`, ''), certNode.value);
    };
};
// cache existing virtual hosts
const virtualHostNodes = etcd.getSync (`${vHostDir}`, {recursive: true});
if (isIterable (virtualHostNodes.body.node.nodes)) {
    for (let virtualHostNode of virtualHostNodes.body.node.nodes) {
        const vHostDomain = virtualHostNode.key.replace (`${vHostDir}/`, '');
        const vHost = JSON.parse(virtualHostNode.value);
        vHosts.set (vHostDomain, vHost);
        dockerServices.set (vHost.serviceID, vHostDomain);
    };
};

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
        contact: [email]
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
    // on service creation or update
    if (event.Type === 'service') {
        if (event.Action === 'update') {
            print (`detected updated docker service ${event.Actor.ID}`);
            const service = await docker.getService (event.Actor.ID).inspect();
            // check that the service has the requisite label(s)
            if (service.Spec.Labels.VIRTUAL_HOST) {
                // parse virtual host
                const virtualURL = new URL (service.Spec.Labels.VIRTUAL_HOST);

                // map docker service ID to hostname
                dockerServices.set (event.Actor.ID, virtualURL.hostname);
                // only the leader creates new hosts
                if (isLeader) {
                    const virtualHost = {};
                    virtualHost.serviceID = event.Actor.ID;
                    // this is where default options are set
                    virtualHost.options = {};
                    virtualHost.options.secure = false; // do not check other ssl certs
                    virtualHost.options.target = `${virtualURL.protocol}//${service.Spec.Name}:${virtualURL.port}`;
                    print (`target set to ${virtualURL.protocol}//${service.Spec.Name}:${virtualURL.port}`);
                    // check if auth is required
                    if (service.Spec.Labels.VIRTUAL_AUTH) {
                        virtualHost.auth = service.Spec.Labels.VIRTUAL_AUTH;
                        print (`virtual auth read as ${virtualHost.auth}`)
                    };
                    // check if etcd already has a cert for this domain
                    if (certs.has (virtualURL.hostname)) {
                        print (`using existing cert for ${virtualURL.hostname}`);
                    };
                    print (`adding virtual host to etcd...`);
                    await etcd.setAsync (`${vHostDir}/${virtualURL.hostname}`,
                        JSON.stringify (virtualHost)
                    );

                    // if domain does not already have a cert && only the leader
                    if (!certs.has (virtualURL.hostname)) {
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
        };

        if (event.Action === 'remove') {
            print (`detected removed docker service ${event.Actor.ID}`);
            if (dockerServices.has (event.Actor.ID)) {
                // only leader handles etcd hosts
                if (isLeader) {
                    print (`removing virtual host ${dockerServices.get (event.Actor.ID)} from etcd and cache...`);
                    await etcd.delAsync (`${vHostDir}/${dockerServices.get (event.Actor.ID)}`);
                };
                dockerServices.delete (event.Actor.ID);
            } else {
                print (`docker service ${dockerServices.get (event.Actor.ID)} has no virtual host`);
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

        // remove completed challeng
        print (`removing completed challenge...`);
        await etcd.delAsync (event.node.key);

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
        await etcd.setAsync (`${certDir}/${value.domain}`, cert, {ttl: 7776000}); // 90-day ttl
    };
})
.on ('error', (error) => {
    print (`ERROR: ${error}`);
});

// watch for new certs
etcd.watcher (certDir, null, {recursive: true})
.on ('set', (event) => {
    const domain = event.node.key.replace (`${certDir}/`, '');
    print (`found new cert for ${domain} in etcd`);
    certs.set (domain, event.node.value);
})
.on ('expire', (event) => {
    const domain = event.node.key.replace (`${certDir}/`, '');
    print (`cert for ${domain} expired`);
    certs.delete (domain);
})
.on ('error', (error) => {
    print (`ERROR: ${error}`);
});

// watch for new and/or removed virtual hosts
etcd.watcher (vHostDir, null, {recursive: true})
.on ('set', (event) => {
    print (`found new virtual host in etcd`);
    const vHostDomain = event.node.key.replace (`${vHostDir}/`, '');
    const vHost = JSON.parse (event.node.value);
    print (`caching virtual host for ${vHostDomain} ...`);
    vHosts.set (vHostDomain, vHost);
})
.on ('delete', (event) => {
    print (`virtual host deleted in etcd`);
    const vHostDomain = event.node.key.replace (`${vHostDir}/`, '');
    print (`removing virtual host ${vHostDomain} from cache...`);
    vHosts.delete (vHostDomain);
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
    // if request is for ACME challenge
    if (requestURL.pathname && requestURL.pathname.startsWith('/.well-known/acme-challenge/')) {

        // pull challenge response from etcd
        const token = requestURL.pathname.replace('/.well-known/acme-challenge/', '');
        const value = (await etcd.getAsync (`${challengeDir}/${token}`)).node.value;
        const challengeResponse = JSON.parse (value).response;

        // write challenge response to request
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

// create proxy, HTTP and HTTPS servers
const proxy = httpProxy.createProxyServer({})
.on ('error', (error)  => print (error));

https.createServer ({
    SNICallback: (domain, callback) => {
        if (certs.has(domain)) {
            return callback (null, tls.createSecureContext({
                key: defaultKey,
                cert: certs.get(domain)
            }));
        } else {
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
            response.end ('Authorization is required.');
            return;  
        };

        // parse authentication header
        const requestAuth = (Buffer.from (request.headers.authorization.replace(/^Basic/, ''), 'base64')).toString('utf-8');
        const [requestUser, requestPassword] = requestAuth.split (':');

        // parse vHost auth parameter
        const [virtualUser, virtualHash] = virtualHost.auth.split (':');

        // compare provided header with expected values
        if (requestUser === virtualUser && (await compareHash (requestPassword, virtualHash))) {
            print (`basic auth passed`);
            proxy.web (request, response, virtualHost.options);
        } else {
            response.end ('Authorization failed.');
        };

    } else {
        // basic auth not required 
        proxy.web (request, response, virtualHost.options);
    };
})
.on ('error', (error) => print (error))
.listen(443);

// periodically check for expriring certificates
const renewInterval = typeof process.env.RENEW_INTERVAL === 'string' ? parseInt (process.env.RENEW_INTERVAL) * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
setInterval (async () => {
    try {
        // only leader runs renewals
        if (isLeader) {
            // fetch all certificates
            const allCerts_ = await etcd.getAsync (certDir, {recursive: true});
            const allCerts = allCerts_.node.nodes;

            // check if each cert is approaching expiration
            for await (let cert of allCerts) {
                const domain = cert.key.replace (`${certDir}/`, '');
                const daysUntilExpiration = dateDiff (new Date (cert.expiration), new Date ());
                print (`certificate for ${domain} expires in ${daysUntilExpiration} days`);
                // only renew certs for domains with virtual hosts
                if (vHosts.has (domain) && daysUntilExpiration < 45) {
                    // place order for signed certificate
                    print (`renewing Let's Encrypt certificate for ${domain} ...`);
                    const order = await client.createOrder({
                        identifiers: [
                            { type: 'dns', value: domain },
                        ]
                    });

                    // get http authorization token and response
                    print (`getting authorization token for ${domain} ...`);
                    const authorizations = await client.getAuthorizations(order);
                    const httpChallenge = authorizations[0]['challenges'].find (
                        (element) => element.type === 'http-01');
                    const httpAuthorizationToken = httpChallenge.token;
                    const httpAuthorizationResponse = await client.getChallengeKeyAuthorization(httpChallenge);

                    // add challenge and response to etcd
                    print (`setting token and response for ${domain} in etcd...`);
                    await etcd.setAsync (`${challengeDir}/${httpAuthorizationToken}`, // key
                        JSON.stringify({ // etcd value
                            domain: domain,
                            order: order,
                            challenge: httpChallenge,
                            response: httpAuthorizationResponse
                        }
                    ), { ttl: 864000 }); // 10-day expiration
                };
            };
        };
    } catch (error) {
        print ('error renewing certificates');
        print (error);
    };
        
}, renewInterval); // run once per set interval