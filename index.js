"use strict";

// dependencies
const acme = require ('acme-client');
acme.axios.defaults.proxy = { // acme needs to be a proxy
    host: '127.0.0.1',
    port: 9000
};
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
const { v4: uuidv4 } = require ('uuid');

// logging formatter
const dateFormat = new DateFormat('YYYY[-]MM[-]DD HH[:]mm[:]ss');
function print (output) {
    console.log (`[${dateFormat.format(new Date())}] ${output}`);
};

const uuid = uuidv4();
print (`starting process with uuid ${uuid}...`);

// parse etcd hosts
print (`parsing etcd hosts...`);
const etcdHosts = process.env.ETCD.split (',');
for (let i = 0; i < etcdHosts_.length; i++) {
    etcdHosts[i] = etcdHosts[i].trim();
};

print (`connecting to etcd...`);
const etcd2 = new Etcd2 (etcdHosts);

// elect and monitor proxy leader
print (`electing leader...`);
const election = etcdLeader(etcd2, "/master", uuid, 10).start();
var isMaster = false;
election.on ('elected', () => {
    isMaster = true;
    print (`this node ${uuid} elected as leader`);
});
election.on ('unelected', function() {
    isMaster = false;
    print (`this node ${uuid} is no longer leader`);
});
election.on ('leader', (node) => {
    print (`node ${node} elected as leader`);
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

plainServer.listen(80);
secureServer.listen(443);
print (`listening on ports 80 and 443...`);