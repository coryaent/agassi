"use strict";
require ('dotenv').config ();

// dependencies
const print = require ('./print.js');
const { sleep } = require ('sleepjs');

const os = require ('os');
const fs = require ('fs');
const { spawn } = require ('child_process');

const Discover = require ('node-discover');
const EventEmitter = require ('events');

const rqlite = require ('./rqlite.js');
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
const dockerEvents = new DockerEvents ({docker: docker});

// options and variable for rqlited and rqlite client
var rqlited = null;
const rqlitedArgs = [
    '-http-addr', '0.0.0.0:4001',
    '-http-adv-addr', `${os.hostname()}:4001`,
    '-raft-addr', '0.0.0.0:4002',
    '-raft-adv-addr', `${os.hostname()}:4002`,
    '/data'
];

// track cluster initialization and master status
var isMaster = false;
var master = null;
// Initialization {
//     cluster: // initialize the whole cluster or just one node
//     hostname: // a known good hostname
// }
const Initialization = new EventEmitter ()
.once ('done', (initialization) => {
    // join cluster if not master or the cluster is already init.
    if ((!isMaster) || (initialization.cluster == false)) {
        rqlitedArgs.unshift ('-join', `http://${initialization.hostname}:4001`);
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

    // create tables
    if (isMaster) {
        print (`creating DB tables...`);
        const response = await rqlite.post ('/db/execute', [
            Query.services.createTable,
            Query.challenges.createTable,
            Query.certificates.createTable
        ]);
        print (`got status ${response.statusText} in ${response.data.time} seconds`);
    };
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

// start cluster
var peers = 0;
const cluster = new Discover ({
    helloInterval: 5 * 1000,
    checkInterval: 4 * 2000,
    nodeTimeout: 60 * 1000,
    address: ip.address(),
    unicast: iprange (`${ip.address()}/24`),
    port: 4000,
    key: clusterKey
}, async (error) => {
    // callback on initialization

    // catch error with cluster
    if (error) { print (error.name); print (error.message); process.exitCode = 1; };

    // looking for peers
    print ('looking for peers...');
    const retries = 3; let attempt = 1;
    while ((peers < 1) && (master == null) && (attempt <= retries)) {
        // backoff
        await sleep ( attempt * 20 * 1000);
        if (peers < 1 || master == null) {
            if (peers < 1) { print (`no peers found`); };
            if (master == null) { print (`could not determine cluster master`); };
            print (`retrying (${attempt}/${retries})...`);
            attempt++;
        };
    };

    // either move on or quit
    if (peers > 0 && master != null) {
        Initialization.emit ('done', {
            cluster: true,
            hostname: master.hostName
        });
    } else {
        // no peers or no master, no run
        if (peers <= 0) { print ('could not find any peers'); };
        if (master == null) { print ('could not determine cluster master'); };
        process.kill (process.pid);
    };
    
})
.on ('master', (node) => {
    master = node;    
})
.on ('promotion', async () => {
    // this node is now the master, init. Let's Encrypt account
    isMaster = true;
    print (`this node ${os.hostname()} is master`);
    print (`initializing Let's Encrypt account...`);
    await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [email]
    });
})
.on ('demotion', () => {
    // this node is no longer master
    isMaster = false;
})
.on ('added', (node) => {
    peers++;
    // node added to cluster
    if (node.advertisement == 'initialized') {
        // initialize new node in existing cluster
        Initialization.emit ('done', {
            cluster: false,
            hostname: node.hostName
        });
    };
})
.on ('removed', async (node) => {
    peers--;
    // if this node is master, remove the lost node
    if (isMaster) {
        print (`removing node ${node.hostname}...`);
        const response = await rqlite.delete ('/remove', {"id": node.hostname});
        print (`got status ${response.statusText} in ${response.data.time} seconds`);
    };
});

// listen to docker socket for new services
dockerEvents.on ('_message', async (event) => {
    // on service creation or update
    if (event.Type === 'service') {
        if (event.Action === 'update' || event.Action === 'create') {
            print (`detected updated docker service ${event.Actor.ID}`);
            const service = await docker.getService (event.Actor.ID).inspect();
            // check that the service has the requisite label(s)
            if (service.Spec.Labels.VIRTUAL_HOST) {
                await addService (service);
            };
        };

        if (event.Action === 'remove') {
            print (`detected removed docker service ${event.Actor.ID}`);
            await removeService (event.Actor.ID);
        };
    };
});

// poll docker periodically in case of missed eventns
const dockerPoll = setInterval (async () => {
    print ('polling docker services...');
    const allServices = await docker.listServices ();
    // for every service
    for await (let service_ of allServices) {
        const ID = service_.ID;
        // get all service details
        const service = await docker.getService (ID).inspect ();
        // docker has valid service but it is not in agassi
        if (service.Spec.Labels.VIRTUAL_HOST && !dockerServices.has (ID)) {
            print (`found previously unknown service ${ID}`);
            await addService (service);
        };
    };

    // agassi has service that is no longer in docker
    for await (let knownService of Array.from (dockerServices.keys())) {
        if (!allServices.find ((service) => { knownService == service.ID; })) {
            print ('removing dangling service');
            await removeService (knownService);
        };
    };
}, 60 * 1000);

// periodically check for expriring certificates
const renewInterval = process.env.RENEW_INTERVAL ? parseInt (process.env.RENEW_INTERVAL) * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
const renewPoll = setInterval (async () => {
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
                    await placeCertOrder (domain);
                };
            };
        };
    } catch (error) {
        print (error.name);
        print (error.message);
    };
        
}, renewInterval); // run once per set interval

// graceful exit
process.once ('SIGTERM', () => {
    print (`SIGTERM received...`);
    print (`Shutting down...`);

    // stop docker listener
    dockerEvents.stop ();

    // close servers
    HTTP.close ();
    HTTPS.close ();
    Proxy.close ();

    // stop periodic events
    clearInterval (dockerPoll);
    clearInterval (renewPoll);

    // stop sub-processes
    if (rqlited) {rqlited.kill ();};
    shipwreck.kill ();
});

/*-----------------------------------------------------------------------------------------------\
|----------------------------------- helper functions -------------------------------------------|
\-----------------------------------------------------------------------------------------------*/

// add a new docker service to agassi
async function addService (service) {
    // parse virtual host
    const virtualURL = new URL (service.Spec.Labels.VIRTUAL_HOST);

    // map docker service ID to hostname
    dockerServices.set (service.ID, virtualURL.hostname);
    // only the leader creates new hosts
    if (isLeader) {
        const virtualHost = {};
        virtualHost.serviceID = service.ID;
        // this is where default options are set
        virtualHost.options = {};
        // virtualHost.options.secure = false; // do not check other ssl certs
        virtualHost.options.target = `${virtualURL.protocol}//${service.Spec.Name}:${virtualURL.port}`;
        print (`target set to ${virtualURL.protocol}//${service.Spec.Name}:${virtualURL.port}`);
        // check if auth is required
        if (service.Spec.Labels.VIRTUAL_AUTH) {
            // decode base64
            virtualHost.auth = ((Buffer.from (service.Spec.Labels.VIRTUAL_AUTH, 'base64')).toString('utf-8')).trim();
            print (`virtual auth read as ${virtualHost.auth}`);
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
            await placeCertOrder (virtualURL.hostname);
        };
    };
};

async function removeService (serviceID) {

    if (dockerServices.has (serviceID)) {
        // only leader handles etcd hosts
        if (isLeader) {
            print (`removing virtual host ${dockerServices.get (serviceID)} from etcd and cache...`);
            await etcd.delAsync (`${vHostDir}/${dockerServices.get (serviceID)}`);
        };
        dockerServices.delete (serviceID);
    } else {
        print (`docker service ${serviceID} has no virtual host`);
    };
}

// create a new certificate order and add response to etcd 
async function placeCertOrder (domain) {

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