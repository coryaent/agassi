"use strict";
require ('dotenv').config ();

// dependencies
const { v4: uuidv4 } = require ('uuid');
const print = require ('./print.js');
const acme = require ('acme-client');
const Etcd = require ('node-etcd');
const bluebird = require ('bluebird'); bluebird.promisifyAll(Etcd.prototype);
const etcdLeader = require ('etcd-leader');
const dolphin = require ('dolphin')();
const fs = require ('fs');
const httpProxy = require ('http-proxy');
const http = require ('http');
const https = require ('https');

const uuid = uuidv4();
print (`starting process with uuid ${uuid}...`);

// load keys for HTTPS server and Let's Encrypt
print (`loading certificates...`);
const defaultKey = fs.readFileSync (process.env.DEFAULT_KEY);
const defaultCert = fs.readFileSync (process.env.DEFAULT_CRT);
const acmeKey = fs.readFileSync (process.env.ACME_KEY);

// local cache of virtual hosts
const vHosts = new Map ();

// acme client
const client = new acme.Client({
    directoryUrl: process.env.STAGING == true ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production,
    accountKey: acmeKey
});

// parse etcd hosts
print (`parsing etcd hosts...`);
const etcdHosts = process.env.ETCD.split (',');
for (let i = 0; i < etcdHosts_.length; i++) {
    etcdHosts[i] = etcdHosts[i].trim();
};

print (`connecting to etcd...`);
const etcd = new Etcd (etcdHosts);

// create requisite directories for watchers
etcd.mkdirSync ('/challenges');
etcd.mkdirSync ('/virtual-hosts');

// elect and monitor proxy leader
print (`electing leader...`);
const election = etcdLeader(etcd, process.env.ELECTION_DIR, uuid, 10).start();
var isLeader = false;
election.on ('elected', async () => {
    isLeader = true;
    print (`this node ${uuid} elected as leader`);
    print (`initializing Let's Encrypt account...`);
    await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [process.env.EMAIL]
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

        };
    };
})
.on ('error', (error) => {
    print (`ERROR: ${error}`);
});

// watch for new ACME challenges
etcd.watcher ('/challenges', null, {recursive: true})
.on ('set', async (event) => {
    // only the leader communicates that a challenge is ready
    if (isLeader) {

    };
})
.on ('error', (error) => {
    print (`ERROR: ${error}`);
});

// watch for new virtual hosts
etcd.watcher ('/virtual-hosts', null, {recursive: true})
.on ('set', async (event) => {
    // let vHost = event.node.key.replace ('/virtual-hosts/', '');
    // let options = JSON.parse (event.node.value);
    // vHosts.set (vHost, options);
})
.on ('error', (error) => {
    print (`ERROR: ${error}`);
});

// create proxy, HTTP and HTTPS servers
const proxy = httpProxy.createProxyServer({});

const plainServer = http.createServer (async (request, response) => {
    // check request path
    if (request.pathname.startsWith('/.well-known/acme-validation/')) {
        // process ACME validation
        let token = request.pathname.replace('/.well-known/acme-validation/', '');


        response.writeHead(200, {
            'Content-Type': 'text/plain'
        });
    } else {
        // redirect to https
        response.writeHead(301, {
            "Location": "https://" + request.headers['host'] + request.url
        });
        response.end();
    };
});

const secureServer = https.createServer ({
    key: defaultKey,
    cert: defaultCert
}, (request, response) => {
    const options = {};
    proxy.web(req, res, { target: 'http://127.0.0.1:5050' });
});

plainServer.listen(80);
secureServer.listen(443);
print (`listening on ports 80 and 443...`);

// periodically check for expriring certificates
setInterval (async () => {

}, 86400); // run once per day