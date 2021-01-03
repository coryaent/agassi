"use strict";
require ('dotenv').config ();

// dependencies
const print = require ('./print.js');
const { sleep } = require ('sleepjs');

const os = require ('os');
const fs = require ('fs');
const { spawn, execFileSync } = require ('child_process');

const Discover = require ('node-discover');
const EventEmitter = require ('events');

const ip = require ('ip');
const iprange = require ('iprange');

const axios = require ('axios');
const rqliteOpts = require ('./rqliteOpts.js');
const Query = require ('./query.js');

const acme = require ('acme-client');
const dateDiff = require ('date-range-diff');

const Docker = require ('dockerode');
const DockerEvents = require ('docker-events');

const HTTP = require ('./http.js');
const HTTPS = require ('./https.js');

// config
const labelPrefix = process.env.LABEL_PREFIX ? process.env.LABEL_PREFIX : 'agassi';
const clusterKey = process.env.CLUSTER_KEY ? fs.readFileSync (process.env.CLUSTER_KEY, 'utf-8') : null;
const socketPath = process.env.SOCKET_PATH ? process.env.SOCKET_PATH : '/tmp/shipwreck.sock';

// start shipwreck read-only docker socket proxy
print ('starting shipwreck...');
const shipwreck = spawn ('shipwrecker', [], {
    stdio: ['ignore', 'inherit', 'inherit']
})
.on ('error', (error) => {
    print (error.name);
    print (error.message);
    process.exitCode = 1;
});

// load keys for HTTPS server and Let's Encrypt
print (`loading keys and email address...`);
const acmeKey = fs.readFileSync (process.env.ACME_KEY, 'utf-8');
const email = ((fs.readFileSync (process.env.EMAIL, 'utf-8')).trim()).startsWith('mailto:') ?
    (fs.readFileSync (process.env.EMAIL, 'utf-8')).trim() :
    'mailto:' + (fs.readFileSync (process.env.EMAIL, 'utf-8')).trim();

// acme client
const client = new acme.Client({
    directoryUrl: process.env.STAGING == 'true' ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production,
    accountKey: acmeKey
});
print (`${ process.env.STAGING == 'true' ? 'using staging environment...':'using production environment...'}`);

// docker client
const docker = new Docker ({socketPath: socketPath});
const dockerEvents = new DockerEvents ({docker: docker})
.on ('error', (error) => {
    print (error.name);
    print (error.message);
});

// options and variable for rqlited and rqlite client
var rqlited = null;
const rqlitedArgs = [
    '-http-addr', '0.0.0.0:4001',
    '-http-adv-addr', `${os.hostname()}:4001`,
    '-raft-addr', '0.0.0.0:4002',
    '-raft-adv-addr', `${os.hostname()}:4002`,
    '/data'
];
try {
    execFileSync ('rqmkown');
} catch (error) {
    print ('error running native initialization binary rqmkown');
    process.exitCode = 1;
};
const rqlite = axios.create (rqliteOpts);



// Initialization {
//     cluster:     // initialize the whole cluster or just one node
//     hostnames:   // array of good hostnames
// }
const Initialization = new EventEmitter ()
.once ('done', async (initialization) => {
    // join cluster if not master or the cluster is already init.
    if (((!isMaster) || (initialization.cluster == false)) && initialization.hostnames.length > 0) {
        let joinHosts = '';
        for await (let hostname of initialization.hostnames) {
            joinHosts += `http://${hostname}:4001`;
            if (hostname != initialization.hostnames[initialization.hostnames.length - 1]) {
                joinHosts += ',';
            }
        };
        rqlitedArgs.unshift ('-join', joinHosts);
    };
    // start rqlite daemon
    rqlited = spawn ('rqlited', rqlitedArgs, {
        stdio: ['ignore', 'inherit', 'inherit']
    })
    .on ('error', (error) => {
        print (error.name);
        print (error.message);
        process.exitCode = 1;
    });
    // indicate to other nodes that the cluster 
    // (and this node) are initialized
    cluster.advertise ('initialized');

    // give rqlited a few seconds
    await sleep (10 * 1000);

    // create tables
    if (isMaster) {
        print (`creating DB tables...`);
        try {
            const response = await rqlite.post ('/db/execute', [
                Query.services.createTable,
                Query.challenges.createTable,
                Query.certificates.createTable
            ]);
            print (`got status ${response.statusText} in ${response.data.time} seconds`);
        } catch (error) { print (error.name); print (error.message); };
    };

    // start listeners
    print ('watching docker socket...');
    dockerEvents.start ();
    HTTP.listen (80, null, (error) => {
        if (error) {
            print (error.name);
            print (error.message);
            process.exitCode = 1;
        } else {
            print (`listening on port 80...`);
        };
    });
    HTTPS.listen (443, null, (error) => {
        if (error) {
            print (error.name);
            print (error.message);
            process.exitCode = 1;
        } else {
            print (`listening on port 443...`);
        };
    });
});

// listen to docker socket for new services
// dockerEvents.on ('_message', async (event) => {
//     // on service creation or update
//     if (event.Type === 'service') {
//         if (event.Action === 'update' || event.Action === 'create') {
//             print (`detected updated docker service ${event.Actor.ID}`);
//             const service = await docker.getService (event.Actor.ID).inspect();
//             // check that the service has the requisite label(s)
//             if (service.Spec.Labels.VIRTUAL_HOST) {
//                 await addService (service);
//             };
//         };

//         if (event.Action === 'remove') {
//             print (`detected removed docker service ${event.Actor.ID}`);
//             await removeService (event.Actor.ID);
//         };
//     };
// });

// // poll docker periodically in case of missed eventns
// const dockerPoll = setInterval (async () => {
//     print ('polling docker services...');
//     const allServices = await docker.listServices ();
//     // for every service
//     for await (let service_ of allServices) {
//         const ID = service_.ID;
//         // get all service details
//         const service = await docker.getService (ID).inspect ();
//         // docker has valid service but it is not in agassi
//         if (service.Spec.Labels.VIRTUAL_HOST && !dockerServices.has (ID)) {
//             print (`found previously unknown service ${ID}`);
//             await addService (service);
//         };
//     };

//     // agassi has service that is no longer in docker
//     for await (let knownService of Array.from (dockerServices.keys())) {
//         if (!allServices.find ((service) => { knownService == service.ID; })) {
//             print ('removing dangling service');
//             await removeService (knownService);
//         };
//     };
// }, 60 * 1000);

// // periodically check for expriring certificates
// const renewInterval = process.env.RENEW_INTERVAL ? parseInt (process.env.RENEW_INTERVAL) * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
// const renewPoll = setInterval (async () => {
//     try {
//         // only leader runs renewals
//         if (isLeader) {
//             // fetch all certificates
//             const allCerts_ = await etcd.getAsync (certDir, {recursive: true});
//             const allCerts = allCerts_.node.nodes;

//             // check if each cert is approaching expiration
//             for await (let cert of allCerts) {
//                 const domain = cert.key.replace (`${certDir}/`, '');
//                 const daysUntilExpiration = dateDiff (new Date (cert.expiration), new Date ());
//                 print (`certificate for ${domain} expires in ${daysUntilExpiration} days`);
//                 // only renew certs for domains with virtual hosts
//                 if (vHosts.has (domain) && daysUntilExpiration < 45) {
//                     // place order for signed certificate
//                     print (`renewing Let's Encrypt certificate for ${domain} ...`);
//                     await placeCertOrder (domain);
//                 };
//             };
//         };
//     } catch (error) {
//         print (error.name);
//         print (error.message);
//     };
        
// }, renewInterval); // run once per set interval

// graceful exit
process.once ('SIGTERM', () => {
    print (`SIGTERM received...`);
    print (`shutting down...`);

    try {
        print ('stopping docker event listener...');
        dockerEvents.stop ();
    } catch (error) { print (error.name); print (error.message); process.exitCode = 1; };

    try {
        print ('stopping web services...');
        HTTP.close ();
        HTTPS.close ();
        Proxy.close ();
    } catch (error) { print (error.name); print (error.message); process.exitCode = 1; };

    try {
        print ('stopping discovery cluster...');
        cluster.stop ();
    } catch (error) { print (error.name); print (error.message); process.exitCode = 1; };

    // stop periodic events
    // clearInterval (dockerPoll);
    // clearInterval (renewPoll);

    try {
        print ('stopping rqlited...');
        if (rqlited) { rqlited.kill (); };
    } catch (error) { print (error.name); print (error.message); process.exitCode = 1; };

    try {
        print ('stopping shipwreck...');
        shipwreck.kill ();
    } catch (error) { print (error.name); print (error.message); process.exitCode = 1; };
});

/*-----------------------------------------------------------------------------------------------\
|----------------------------------- helper functions -------------------------------------------|
\-----------------------------------------------------------------------------------------------*/

// add a new docker service to agassi
// async function addService (service) {
//     // parse virtual host
//     const virtualURL = new URL (service.Spec.Labels.VIRTUAL_HOST);

//     // map docker service ID to hostname
//     dockerServices.set (service.ID, virtualURL.hostname);
//     // only the leader creates new hosts
//     if (isLeader) {
//         const virtualHost = {};
//         virtualHost.serviceID = service.ID;
//         // this is where default options are set
//         virtualHost.options = {};
//         // virtualHost.options.secure = false; // do not check other ssl certs
//         virtualHost.options.target = `${virtualURL.protocol}//${service.Spec.Name}:${virtualURL.port}`;
//         print (`target set to ${virtualURL.protocol}//${service.Spec.Name}:${virtualURL.port}`);
//         // check if auth is required
//         if (service.Spec.Labels.VIRTUAL_AUTH) {
//             // decode base64
//             virtualHost.auth = ((Buffer.from (service.Spec.Labels.VIRTUAL_AUTH, 'base64')).toString('utf-8')).trim();
//             print (`virtual auth read as ${virtualHost.auth}`);
//         };
//         // check if etcd already has a cert for this domain
//         if (certs.has (virtualURL.hostname)) {
//             print (`using existing cert for ${virtualURL.hostname}`);
//         };
//         print (`adding virtual host to etcd...`);
//         await etcd.setAsync (`${vHostDir}/${virtualURL.hostname}`,
//             JSON.stringify (virtualHost)
//         );

//         // if domain does not already have a cert && only the leader
//         if (!certs.has (virtualURL.hostname)) {
//             // place order for signed certificate
//             print (`ordering Let's Encrypt certificate for ${virtualURL.hostname} ...`);
//             await placeCertOrder (virtualURL.hostname);
//         };
//     };
// };

// async function removeService (serviceID) {

//     if (dockerServices.has (serviceID)) {
//         // only leader handles etcd hosts
//         if (isLeader) {
//             print (`removing virtual host ${dockerServices.get (serviceID)} from etcd and cache...`);
//             await etcd.delAsync (`${vHostDir}/${dockerServices.get (serviceID)}`);
//         };
//         dockerServices.delete (serviceID);
//     } else {
//         print (`docker service ${serviceID} has no virtual host`);
//     };
// }

// // create a new certificate order and add response to etcd 
// async function placeCertOrder (domain) {

//     const order = await client.createOrder({
//         identifiers: [
//             { type: 'dns', value: domain },
//         ]
//     });

//     // get http authorization token and response
//     print (`getting authorization token for ${domain} ...`);
//     const authorizations = await client.getAuthorizations(order);
//     const httpChallenge = authorizations[0]['challenges'].find (
//         (element) => element.type === 'http-01');
//     const httpAuthorizationToken = httpChallenge.token;
//     const httpAuthorizationResponse = await client.getChallengeKeyAuthorization(httpChallenge);

//     // add challenge and response to etcd
//     print (`setting token and response for ${domain} in etcd...`);
//     await etcd.setAsync (`${challengeDir}/${httpAuthorizationToken}`, // key
//         JSON.stringify({ // etcd value
//             domain: domain,
//             order: order,
//             challenge: httpChallenge,
//             response: httpAuthorizationResponse
//         }
//     ), { ttl: 864000 }); // 10-day expiration
// };