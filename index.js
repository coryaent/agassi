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
const EventEmitter = require ('events');
const dolphin = require ('dolphin')();
const httpProxy = require ('http-proxy');
const http = require ('http');
const https = require ('https');
const auth = require("http-auth");
const url = require ('url');
const tls = require ('tls');
const memoize = require ('nano-memoize');

const uuid = uuidv4();
print (`starting process with uuid ${uuid}...`);

// load keys for HTTPS server and Let's Encrypt
print (`loading certificates...`);
const defaultKey = fs.readFileSync (process.env.DEFAULT_KEY);
const defaultCert = fs.readFileSync (process.env.DEFAULT_CRT);
const acmeKey = fs.readFileSync (process.env.ACME_KEY);

// initialize caches of virtual hosts, SNI secure contexts, and basic authentication
const secureContext = {};
const vHosts = new Map ();
const compareHash = memoize (bcrypt.compare, {maxAge: 1000 * 60 * 60});

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
    // only leader handles new services
    if (isLeader) {
        // on service creation
        if (event.Type === 'service' && event.Action === 'create') {
            print (`detected new docker service ${event.Actor.Attributes.name}`);
            // check that the service has the requisite labels
            if (event.Attributes.VIRTUAL_HOST) {
                // parse virtual host
                const virtualURL = new URL (event.Attributes.VIRTUAL_HOST);

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
                const httpChallenge = await client.getChallengeKeyAuthorization(authorizations[0]['challenges'].find (
                    (element) => element.type === 'http-01'));
                const httpAuthorizationToken = httpChallenge.token;
                const httpAuthorizationResponse = await client.getChallengeKeyAuthorization(httpChallenge);

                // add challenge and response to etcd
                print (`setting token and response for ${virtualURL.hostname} in etcd...`);
                await etcd.setAsync (`${challengDir}/${httpAuthorizationToken}`, // key
                    JSON.stringify({ // etcd value
                        domain: virtualURL.hostname,
                        order: order,
                        challenge: httpChallenge,
                        response: httpAuthorizationResponse
                    }
                ), { ttl: 864000, maxRetries: 3 }, print); // options and error callback
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
        const value = JSON.parse (event.node.value);
        await client.completeChallenge (value.challenge);
        await client.waitForValidStatus(value.challenge);

        const [key, csr] = await acme.forge.createCsr({
            commonName: value.domain
        }, defaultKey);

        await client.finalizeOrder(value.order, csr);
        const cert = await client.getCertificate(value.order); 
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
        const value = await etcd.getAsync (`${challengeDir}/${token}`);
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
    // let vHost = event.node.key.replace ('/virtual-hosts/', '');
    // let options = JSON.parse (event.node.value);
    // vHosts.set (vHost, options);
})
.on ('error', (error) => {
    print (`ERROR: ${error}`);
});


// create proxy, HTTP and HTTPS servers
const proxy = httpProxy.createProxyServer({})
.on ('error', (error)  => print (error));
https.createServer ({
    SNICallback: function (domain, cb) {
        if (secureContext[domain]) {
            cb (null, secureContext[domain]);
        } else {
            cb (null, secureContext["default"]);
        };
    },
    key: defaultKey,
    cert: defaultCert
}, (request, response) => {
    print ('received new https request');
    const requestURL = new URL(request.url, `https://${request.headers.host}`);
    print (requestURL.hostname);
    const virtualHost = vHosts.get (requestURL.hostname);
    // basic auth protected host
    if (virtualHost.auth) {
        // auth required but not provided
        if (!request.headers.authorization) {
            // prompt for password in browser
            response.writeHead(401, { 'WWW-Authenticate': `Basic realm="${requestURL.hostname}"`});
            response.end ('Authorization is needed');
            return; 
        };

        // parse authentication header
        const requestAuth = (new Buffer (request.headers.authorization.replace(/^Basic/, ''), 'base64')).toString('utf-8');
        const [requestUser, requestPassword] = requestAuth.split (':');

        // compare provided header with expected values
        if (requestUser === virtualHost.auth.user && await compareHash (requestPassword, virtualHost.auth.hash)) {
            // authentication passed
        } else {
            response.end ('Authentication failed.');
        };

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