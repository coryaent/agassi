"use strict";

/*
    the client script pulls existing virtual hosts and adds new virtual hosts based on events

    when adding a virtual host we must check to see that it is the latest update
    therefore, we need to check the UpdatedAt property to see which is greater

    we cannot call
        docker.getService (id);
        service.inspect ();
    on a service upon removal
    therefore, we need to iterate over the keys at /agassi/virtual-hosts/v0 and parse their JSON values
    when a matching serviceID is found, we remove the service

    maintenance needs to run on a regular interval (specified in hours, default to 24)
    it needs to perform function
      - scan each cert
        a) if there is an virtual host for the cert, check if its expiration is past a threshold
           (expires within 45 days by default)
        b) otherwise don't renew the cert (it will be removed from etcd automatically when the lease expires)
*/

const log = require ('./logger.js');

const { parseVirtualHost } = require ('./virtualHost.js');
const { putCnameRecord, putTxtRecord } = require ('./cPanel.js');
const Docker = require ('dockerode');
const { Etcd3 } = require('etcd3');
const acme = require ('acme-client');
const forge = require ('node-forge');
const fs = require ('fs');
const http = require ('http');

// create clients
const acmeClient = new acme.Client({
    directoryUrl: process.env.AGASSI_ACME_PRODUCTION ? acme.directory.letsencrypt.production : acme.directory.letsencrypt.staging,
    accountKey: fs.readFileSync (process.env.AGASSI_ACME_ACCOUNT_KEY_FILE)
});
const etcdClient = new Etcd3({
    hosts: process.env.AGASSI_ETCD_HOSTS.split (',')
});
const docker = new Docker ({
    host: process.env.AGASSI_DOCKER_HOST,
    port: process.env.AGASSI_DOCKER_PORT,
    version: process.env.AGASSI_DOCKER_API_VERSION
});
// legacy code to stop maintenance
var maintenanceInterval = undefined;

/*
    instead of using Date.now(), we should use the .time property from
        seen events
    Date.now() must be used initially because only events have the .time property
    the latest event shold be stored in memory and passed to the listen()
        function
*/
async function start () {
    let timestamp = Math.floor (new Date().getTime () / 1000); // we still need this
    log.info ('client started at ' + timestamp);
    // where to start listening (passed to getEvents)
    // add existing virtual hosts
    log.debug ('checking docker services for agassi virtual hosts');
    let services = await docker.listServices ();
    log.trace (`found ${services.length} docker services`);
    for (let id of services.map (service => service.ID)) {
        let service = await docker.getService (id);
        service = await service.inspect ();
        let virtualHost = parseVirtualHost (service);
        log.trace ('parsed service ' + id);
        if (virtualHost) {
            log.debug ('found agassi virtual host for service ' + service.ID + ' with domain ' + virtualHost.domain);
            log.debug ('setting CNAME record...');
            await putCnameRecord (virtualHost.domain, process.env.AGASSI_TARGET_CNAME);
            log.trace ('CNAME record set');
            log.debug ('adding service to store...');
            await storeVirtualHost (virtualHost);
            log.trace (`service ${virtualHost.serviceID} added to store`);
        }
    }
    // listen for events
    listen (timestamp);
}

/*
    dockerode seems to lose events and so we're trying raw node.js http requests
*/
function listen (timestamp) {
    log.debug ('starting docker events listening since ' + timestamp + ' ...');
    let latestEventTime = timestamp;
    let socketHost = process.env.AGASSI_DOCKER_HOST;
    let socketPort = process.env.AGASSI_DOCKER_PORT;
    http.get(`http://${socketHost}:${socketPort}/events?since=${lastEventTime}`, (resp) => {
        log.info ('docker events stream connected');
        resp.on('data', async (chunk) => {
            let event = JSON.parse(chunk);
            if (event.time > latestEventTime) {
                latestEventTime = event.time;
            }
            log.trace ('received event:', {type: event.Type, time: event.time});
            if (event.Type == 'service') {
                await processEvent (event);
            }
        });
        resp.on('end', () => {
            // this does not have any documentation but it is included
            //     in the event that docker ends the events stream
            log.debug ('docker events response ended, last event seen at ' + latestEventTime);
            log.debug ('reconnecting events stream after end...');
            setTimeout(listen, 7500, latestEventTime);
        });
        resp.on ('close', () => {
            log.warn ('docker events stream closed or lost, last event seen at ' + latestEventTime);
            log.debug ('reconnecting events stream after close...');
            setTimeout(listen, 7500, latestEventTime);
        });

    }).on("error", (err) => {
        log.error ('error connecting to the docker events stream ' + err.message);
        log.debug ('attempting reconnection after error...');
        setTimeout(listen, 7500, latestEventTime);
    });
}

/*
    what this needs to do:
        keep track of the latest events and reconnect from that point
*/
function listenDockerode (timestamp) {
    let lastEventTime = timestamp;
    log.debug (`starting docker service events listener since ${lastEventTime}...`);
    docker.getEvents ({ since: lastEventTime }).then (async (events) => {
        log.info ('docker events listener started');
        events.on ('data', async (data) => {
            let event = JSON.parse (data);
            // keep track of the timestamp passed for reconnection
            if (lastEventTime < event.time) {
                lastEventTime = event.time;
                log.trace ('last event received at ' + lastEventTime);
            }
            // only process service events
            if (event.Type == 'service') {
                log.trace ('got docker service event');
                await processEvent (event);
            }
        });
        events.on ('close', () => {
            // 'close' event fires when the connection is reset
            log.warn ('docker events connection closed, reconnecting...');
            setTimeout (listen, 7500, lastEventTime);
        });
    }).catch ((error) => {
        // catch error in which we cannot reconnect to the docker stream
        log.error ('could not connect to docker event stream:', error.code, 'retrying...');
        setTimeout (listen, 7500, lastEventTime);
    });
}

async function processEvent (event) {
    if (event.Action == 'create' || event.Action == 'update') {
        log.trace ('found new or updated service with ID ' + event.Actor.ID);
        let service = await docker.getService (event.Actor.ID);
        service = await service.inspect ();
        let virtualHost = parseVirtualHost (service);
        // if we have an agassi service
        if (virtualHost) {
            log.debug ('found agassi virtual host for service ' + virtualHost.serviceID + ' with domain ' + virtualHost.domain);
            log.debug ('setting CNAME record...');
            await putCnameRecord (virtualHost.domain, process.env.AGASSI_TARGET_CNAME);
            log.trace ('CNAME record set');
            log.debug ('adding service to store...');
            await storeVirtualHost (virtualHost);
            log.trace (`service ${virtualHost.serviceID} added to store`);
        }
    }
    if (event.Action == 'remove') {
        log.debug ('service ' + event.Actor.ID + ' removed from swarm');
        log.debug ('removing service ' + event.Actor.ID + ' from store...');
        await removeService (event.Actor.ID);
        log.trace ('removed service ' + event.Actor.ID + ' from store');

    }
};


async function storeVirtualHost (virtualHost) {
    log.debug (`adding service ${virtualHost.serviceID} -> vhost ${virtualHost.domain} ...`);
    let vHostPath = `/agassi/virtual-hosts/v0/${virtualHost.domain}`;
    log.debug ('checking for existing agassi service at domain ' + virtualHost.domain + ' ...');
    let existingVirtualHost = await etcdClient.get (vHostPath);
    if (existingVirtualHost) { // service already exists in etcd
        log.trace (`agassi virtual host at ${virtualHost.domain} found in store`);
         // check which virtual host is newer
        log.debug (`checking which virtual host was updated more recently...`);
        if (Date.parse (virtualHost.UpdatedAt) > Date.parse (existingVirtualHost.UpdatedAt)) {
            // add the new host to etcd
            log.debug (`updating agassi virtual host with domain ${virtualHost.domain}...`);
            await etcdClient.put (vHostPath).value (JSON.stringify (virtualHost));
            log.trace ('agassi virtual host updated');
        }
    } else { // add the new host to etcd
        log.debug (`no agassi virtual host with domain ${virtualHost.domain} found in store`);
        await etcdClient.put (vHostPath).value (JSON.stringify (virtualHost));
        log.debug (`agassi virtualHost with domain ${virtualHost.domain} added to store`);
    }
    // check if the certificate exists
    let certPath = `/agassi/certificates/${process.env.AGASSI_ACME_PRODUCTION ? 'production' : 'staging'}/${virtualHost.domain}`;
    log.debug (`checking store for cert with domain ${virtualHost.domain}...`);
    let existingCert = await etcdClient.get (certPath);
    if (existingCert) {
        log.trace (`found cert in store for domain ${virtualHost.domain}`);
    } else {
        log.trace (`no cert found for ${virtualHost.domain}`);
        // need to fetch and add the certificate
        log.debug (`fetching cert for domain ${virtualHost.domain}...`);
        let pemCert = await fetchCertificate (virtualHost.domain);
        log.trace (`fetched cert for domain ${virtualHost.domain}`);
        // get ttl in seconds
        let cert = forge.pki.certificateFromPem (pemCert);
        let ttl = Math.floor ( ( Date.parse (cert.validity.notAfter) - Date.now () ) / 1000 );
        log.trace (`cert will expire in ${ttl / ( 60 * 60 * 24 )} days`);
        // add cert to etcd with ttl
        let lease = etcdClient.lease (ttl, {autoKeepAlive: false});
        await lease.put (certPath).value (pemCert);
    }
};

// this must be done by service ID because once the service is removed we cannot inspect it
async function removeService (serviceID) {
    // leave the cert alone in this circumstance, it will expire on its own
    log.debug (`removing service with ID ${serviceID}...`);
    let prefix = '/agassi/virtual-hosts/v0/';
    log.debug (`getting all agassi virtual hosts to check for service ID ${serviceID}...`);
    let all = await etcdClient.getAll().prefix(prefix).exec();
    // get an array of objects with properties 'key' and 'value'
    //let existingVirtualHosts = [];
    //all.kvs.forEach (pair => existingVirtualHosts.push ({'key': pair[0], 'value': pair[1]}));
    log.trace (`found ${all.kvs.length} agassi virtual hosts in store`);
    for (let vHost of all.kvs) {
        log.debug ('key:', vHost.key.toString());
        log.debug ('value:', vHost.value.toString());
        if (JSON.parse (vHost.value).serviceID == serviceID) {
            log.trace (`deleting virtual host at ${vHost.key.toString()}...`);
            await etcdClient.delete().key(vHost.key.toString());
            log.debug (`${vHost.key.toString()} deleted`);
        }
    }
};

// for updating certificates and pruning old services
const maintenance ={
    start: () => {
        if (!maintenanceInterval) {
            // 60000 is the number of milliseconds in a minute
            maintenanceInterval = setInterval (performMaintenance,
                1000 * 60 * 60 * Number.parseFloat(process.env.AGASSI_MAINTENANCE_INTERVAL));
        }
    },
    stop: () => {
        if (maintenanceInterval) {
            clearInterval (maintenanceInterval);
            maintenanceInterval = undefined;
        }
    }
};

// perform maintenance (will be called at a regular interval)
async function performMaintenance () {
    /*
        this function is far easier now that docker is pulling all
        services and events soundly

        what it needs to do is pull all the certs, check that each cert
        is associate with a virtual host (from the store) and then
        renew certs that are over 45 days old (by default)
    */
    log.debug ('performing maintenance...');
    let vHostPrefix = '/agassi/virtual-hosts/v0/';
    log.debug ('pulling agassi virtual hosts from store...')
    let allVirtualHosts = await etcdClient.getAll().prefix(vHostPrefix).exec();
    log.trace (`found ${allVirtualHosts.kvs.length} agassi virtual hosts in kv store`);
    let vHostDomains = [];
    for (let kv of allVirtualHosts.kvs) {
        let virtualHost = JSON.parse (kv.value);
        vHostDomains.push (virtualHost.domain);
    }

    let certPrefix = `/agassi/certificates/${process.env.AGASSI_ACME_PRODUCTION ? 'production' : 'staging'}/`;
    log.debug ('pulling certificates from store...');
    let allCerts = await etcdClient.getAll().prefix(certPrefix).exec ();
    log.trace (`found ${allCerts.kvs.length} certs in kv store`);
    for (let kv of allCerts.kvs) {
        let key = kv.key.toString ();
        let pemCert = kv.value;
        let certDomain = key.replace (certPrefix, '');
        log.trace (`found cert for domain ${certDomain}`);
        // check that the cert has an associated agassi virtual host
        if (vHostDomains.includes(certDomain)) {
            log.debug (`cert for domain ${certDomain} has corresponding virtual host`);
            // check expiration
            let cert = forge.pki.certificateFromPem (pemCert);
            let daysUntilExpiration = (new Date (cert.validity.notAfter).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
            log.debug (`cert for domain ${certDomain} will expire in ${daysUntilExpiration} days`);
            // if renewal is past the threshold we need to renew
            if (daysUntilExpiration < Number.parseFloat(process.env.AGASSI_EXPIRATION_THRESHOLD)) {
                log.debug (`renewing certificate for ${certDomain}...`);
                let pemUpdatedCert = await fetchCertificate (certDomain);
                log.trace ('got updated cert');
                log.debug ('adding updated cert to store...');
                // get ttl in seconds
                let updatedCert = forge.pki.certificateFromPem (pemUpdatedCert);
                let ttl = Math.floor ( ( Date.parse (updatedCert.validity.notAfter) - Date.now () ) / 1000 );
                log.trace (`updated cert will expire in ${ttl / ( 60 * 60 * 24 )} days`);
                // add cert to etcd with ttl
                let lease = etcdClient.lease (ttl, {autoKeepAlive: false});
                await lease.put (certPrefix + certDomain).value (pemUpdatedCert);
                log.trace ('added updated cert to kv store');
            }
        }
    }
}

function sleep (ms) {
    return new Promise ((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function fetchCertificate (fqdn) {
    const accountOpts = {
        termsOfServiceAgreed: true
    };
    if (process.env.AGASSI_LETS_ENCRYPT_EMAIL) {
        accountOpts.contact = [`mailto:${process.env.AGASSI_LETS_ENCRYPT_EMAIL}`]
    }
    const account = await acmeClient.createAccount(accountOpts);
    log.debug ('creating certificate order...')
    const order = await acmeClient.createOrder({
        identifiers: [
            { type: 'dns', value: fqdn },
        ]
    });
    log.debug ('order:', order);

    log.debug ('fetching authorizations...');
    const authorizations = await acmeClient.getAuthorizations (order);
    log.debug ('finding dns challenge...');
    const dnsChallenge = authorizations[0]['challenges'].find ((element) => element.type === 'dns-01');

    log.debug ('fetching key authorization...');
    const keyAuthorization = await acmeClient.getChallengeKeyAuthorization(dnsChallenge);

    // set txt (ACME)
    log.debug ('setting txt record...');
    const txtSet = await putTxtRecord (`_acme-challenge.${fqdn}`, keyAuthorization);

    // complete challenge
    log.debug ('completing challenge...');
    const completion = await acmeClient.completeChallenge (dnsChallenge);

    // await validation
    log.debug ('awaiting validation...');
    // give the DNS records a few seconds to propagate
    await sleep (7500);
    let validation = await acmeClient.waitForValidStatus (dnsChallenge)

    log.debug ('creating csr...');
    const [key, csr] = await acme.crypto.createCsr ({
        commonName: fqdn
    }, fs.readFileSync (process.env.AGASSI_DEFAULT_KEY_FILE));

    log.debug ('finalizing order...')
    const finalized = await acmeClient.finalizeOrder (order, csr);
    log.debug ('finalized:', finalized);

    log.debug ('fetching cert...');
    let cert = await acmeClient.getCertificate (finalized);
    // I do not know why this is necessary, but getCertificate seems to return three of the same cert in one file.
    cert = cert.substring (0, cert.indexOf ('-----END CERTIFICATE-----')).concat ('-----END CERTIFICATE-----');

    return cert;
}

module.exports = {
    start,
    maintenance
};
