"use strict";

// dependencies
const acme = require ('acme-client');
const httpProxy = require ('http-proxy');
const Etcd2 = require ('node-etcd');
const { Etcd3 } = require ('etcd3');
const etcdLeader = require ('etcd-leader');
const dolphin = require ('dolphin')();
const os = require('os');
const DateFormat = require ('fast-date-format');
const fs = require ('fs');
const http = require ('http');
const https = require ('https');

// acme needs to be a proxy
acme.axios.defaults.proxy = {
    host: '127.0.0.1',
    port: 9000
};

// logging formatter
const dateFormat = new DateFormat('YYYY[-]MM[-]DD HH[:]mm[:]ss');

console.log (`[${dateFormat(Date.now())}] starting process...`);

// parse etcd hosts
console.log (`[${dateFormat(Date.now())}] parsing etcd hosts...`);
const etcdHosts = process.env.ETCD.split (',');
for (let i = 0; i < etcdHosts_.length; i++) {
    etcdHosts[i] = etcdHosts[i].trim();
};

console.log (`[${dateFormat(Date.now())}] connecting to etcd...`);
const etcd2 = new Etcd2 (etcdHosts);

// elect and monitor proxy leader
console.log (`[${dateFormat(Date.now())}] determining leader...`);
const election = etcdLeader(etcd2, "/master", os.hostname(), 10).start();
var isMaster = false;
election.on ('elected', () => {
    console.log (`[${dateFormat(Date.now())}] this node elected as leader`);
    isMaster = true;
});
election.on ('unelected', function() {
    console.log (`[${dateFormate(Date.now())}] this node is no longer leader`);
    isMaster = false;
});
election.on ('leader', (node) => {
    console.log (`[${dateFormat(Date.now())}] node ${node} elected as leader`);
});


// create ACME signing key
// const sslKey = await acme.forge.createPrivateKey();

// listen to docker socket for new containers
dolphin.events({})
.on ('event', async (event) => {
    // on container creation
	if (event.Type === 'container' && event.Action === 'create') {

    };
})
.on ('error', (error) => {
	console.error ('Error:', error);
});

const proxy = httpProxy.createProxyServer({});

const plainServer = http.createServer ( function (request, response) {
    // You can define here your custom logic to handle the request
    // and then proxy the request.
    proxy.web(req, res, { target: 'http://127.0.0.1:5050' });
});

const secureServer = https.createServer ( function (request, response) {
    // You can define here your custom logic to handle the request
    // and then proxy the request.
    const options = {};
    proxy.web(req, res, { target: 'http://127.0.0.1:5050' });
});


console.log("listening on port 80 and 443...");
plainServer.listen(80);
secureServer.listen(443);