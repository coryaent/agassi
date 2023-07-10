"use strict";

/*
    the client script pulls existing services and adds new services based on events

    when adding a service we must check to see that it is the latest update
    therefore, we need to check the UpdatedAt property to see which is greater

    we cannot call
        docker.getService (id);
        service.inspect ();
    on a service upon removal
    therefore, we need to iterate over the keys at /agassi/virtual-hosts/v0 and parse their JSON values
    when a matching serviceID is found, we remove the virtual-host

    maintenance needs to run on a regular interval (specified in hours, default to 24)
    it needs to perform function
      - scan each cert
        a) if there is an agassiService/virtualHost for the cert, check if its expiration is pat a threshold
           (expires within 45 days by default)
        b) otherwise renew the cert (it will be removed from etcd automatically when the lease expires
*/

const log = require ('./logger.js');

const { parseAgassiService } = require ('./agassiService.js');
const { putCnameRecord, putTxtRecord } = require ('./cPanel.js');
const Docker = require ('dockerode');
const { Etcd3 } = require('etcd3');
const acme = require ('acme-client');
const forge = require ('node-forge');
const fs = require ('fs');

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

const msInDay = 86400000;
var maintenanceInterval = undefined;

async function start () {
    // where to start listening (passed to getEvents)
    let timestamp = Math.floor (new Date().getTime () / 1000);
    // add existing services
    let services = await docker.listServices ();
    for (let id of services.map (service => service.ID)) {
        let service = await docker.getService (id);
        service = await service.inspect ();
        let agassiService = parseAgassiService (service);
        log.debug ('parsed service ' + id);
        if (agassiService) {
            log.debug ('found agassi service ' + service.ID + ' with virtual host ' + agassiService.virtualHost);
            log.debug ('setting CNAME record...');
            await putCnameRecord (agassiService.virtualHost, process.env.AGASSI_TARGET_CNAME);
            log.debug ('CNAME record set');
            log.debug ('adding service to store...');
            await addService (agassiService);
            log.debug ('service added to store');
        }
    }
    // listen for events
    log.debug (`starting events listener...`);
    listen (timestamp - 1);
}

function listen (timestamp) {
    docker.getEvents ({ filters: { type: ["service"] }, since: timestamp }).then (async (events) => {
        log.info ('docker events listener started');
        events.on ('data', async (data) => {
            let event = JSON.parse (data);
            await processEvent (event);
        });
        events.on ('close', () => {
            let closedAt = Math.floor (new Date().getTime () / 1000);
            log.warn ('docker events connection closed, reconnecting...');
            setTimeout (listen, 7500, closedAt - 1);
        });
    }).catch ((error) => {
        log.error ('could not connect to docker event stream:', error.code, 'retrying...');
        setTimeout (listen, 7500, timestamp);
    });
}

async function processEvent (event) {
    if (event.Action == 'create' || event.Action == 'update') {
        log.debug ('found new or updated service');
        let service = await docker.getService (event.Actor.ID);
        service = await service.inspect ();
        log.trace ('id: ' + event.Actor.ID);
        let agassiService = parseAgassiService (service);
        // if we have an agassi service
        log.debug ('agassiService:', agassiService);
        if (agassiService) {
            log.debug ('found agassi service ' + agassiService.serviceID + ' with virtual host ' + agassiService.virtualHost);
            await putCnameRecord (agassiService.virtualHost, process.env.AGASSI_TARGET_CNAME);
            await addService (agassiService);
        }
    }
    if (event.Action == 'remove') {
        log.debug ('service ' + event.Actor.ID + ' removed from swarm');
        log.debug ('removing service ' + event.Actor.ID + ' from store...');
        await removeService (event.Actor.ID);
        log.debug ('removed service ' + event.Actor.ID + ' from store');

    }
};


async function addService (agassiService) {
    log.debug ('agassiService:', agassiService);
    // `SET service:[service id] [vhost]`
    log.debug (`setting service ${agassiService.serviceID} -> vhost ${agassiService.virtualHost}`);
    let vHostPath = `/agassi/virtual-hosts/v0/${agassiService.virtualHost}`;
    let existingVirtualHost = await etcdClient.get (vHostPath);
    if (existingVirtualHost) { // service already exists in etcd
         // check which virtual host is newer
        if (Date.parse (agassiService.UpdatedAt) > Date.parse (existingVirtualHost.UpdatedAt)) {
            // add the new host to etcd
            await etcdClient.put (vHostPath).value (JSON.stringify (agassiService));
        }
    } else { // add the new host to etcd
        await etcdClient.put (vHostPath).value (JSON.stringify (agassiService));
    }
    // check if the certificate exists
    let certPath = `/agassi/certificates/${process.env.AGASSI_ACME_PRODUCTION ? 'production' : 'staging'}/${agassiService.virtualHost}`;
    let existingCert = await etcdClient.get (certPath);
    if (!existingCert) {
        log.debug (`no cert found for ${agassiService.virtualHost}`);
        // need to fetch and add the certificate
        let pemCert = await fetchCertificate (agassiService.virtualHost);
        log.debug (`get cert for virtual host ${agassiService.virtualHost}`);
        // get ttl in seconds
        let cert = forge.pki.certificateFromPem (pemCert);
        let ttl = Math.floor ( ( Date.parse (cert.validity.notAfter) - Date.now () ) / 1000 );
        log.debug (`cert will expire in ${ttl / ( 60 * 60 * 24 )} days`);
        // add cert to etcd with ttl
        let lease = etcdClient.lease (ttl, {autoKeepAlive: false});
        await lease.put (certPath).value (pemCert);
    }
};

// this must be done by service ID because once the service is removed we cannot inspect it
async function removeService (serviceID) {
    // leave the cert alone in this circumstance, it will expire on its own
    log.debug (`removing service with ID ${serviceID}`);
    let prefix = '/agassi/virtual-hosts/v0/';
    let all = await etcdClient.getAll().prefix(prefix);
    // get an array of objects with properties 'key' and 'value'
    let existingVirtualHosts = [];
    all.forEach (pair => existingVirtualHosts.push ({'key': pair[0], 'value': pair[1]}));
    for (let vHost of existingVirtualHosts) {
        if (JSON.parse (vHost.value).serviceID == serviceID) {
            log.debug (`deleting virtual host at ${vHost.key}`);
            await etcdClient.delete(vHost.key);
            log.debug (`${vHost.key} deleted`);
        }
    }
};

// for updating certificates and pruning old services
const maintenance ={
    start: () => {
        if (!maintenanceInterval) {
            log.debug ('starting maintenance');
            // 60000 is the number of milliseconds in a minute
            maintenanceInterval = setInterval (performMaintenance, Number.parseInt (process.env.AGASSI_MAINTENANCE_INTERVAL) * 60000);
        }
    },
    stop: () => {
        if (maintenanceInterval) {
            log.debug ('stopping maintenance');
            clearInterval (maintenanceInterval);
            maintenanceInterval = undefined;
        }
    }
};

// perform maintenance (will be called at a regular interval)
async function performMaintenance () {
    log.debug ('performing maintenance');
    // remove services that are no longer in docker
    // pull existing services from db
    let prefix = '/agassi/virtual-hosts/v0/';
    let all = await etcdClient.getAll().prefix(prefix);

    // get a map of key-value pairs [{key: example.com, value: someJSON}]
    // parse JSON later
    let storedAgassiServices = new Map ();
    all.forEach (pair => storedAgassiServices.set (pair[0], pair[1]));
    log.debug (`found ${storedAgassiServices.size} in store`);

    // pull services from docker
    let dockerServiceIDs = (await docker.listServices ()).map (service => service.ID);
    log.debug (`found ${dockerServices.length} docker services`, dockerServices);

    // iterate through each db service and check that it still exists in docker
    log.debug ('looking for services to prune');
    for (let agassiServiceKey of storedAgassiServices.keys ()) {
        // parse JSON here
        let value = JSON.parse (storedAgassiServices.get (agassiServiceKey));
        if (!dockerServiceIDs.includes (value.serviceID)) {
            // remove service from store
            log.debug ('purging ' + value.serviceID + ' from store with vHost ' + value.virtualHost);
            await etcdClient.delete (agassiServiceKey);
            log.debug (`deleted key ${agassiServiceKey} from store`);
            // also remove from map of stored services
            storedAgassiServices.delete (agassiServiceKey);
        }
    }
    /* TODO (the rest of this function) and check that an array may be more effective than a may above */
    // now that they're pruned, fetch the service keys again
    // use keydb here or don't have too many services'
    log.debug ('checking for current certs');
    // update all now that we have pruned
    for (let agassiServiceKey of storedAgassiServices.keys ()) {
        let value = JSON.parse (storedAgassiServices.get (agassiServiceKey));
        let certPath = `/agassi/certificates/${process.env.AGASSI_ACME_PRODUCTION ? 'production' : 'staging'}/${value.virtualHost}`;
        let pemCert = await etcdClient.get (certPath);
        if (pemCert) {
            let cert = forge.pki.certificateFromPem (pemCert);
            let msUntilExpiration = new Date (cert.validity.notAfter).getTime () - new Date ().getTime ();
            let daysUntilExpiration = msUntilExpiration / (1000 * 60 * 60 * 24);
        }
    }
    //console.log ('cert from pem:', certFromPem);
    console.log ('cert years until expiration:', (new Date (certFromPem.validity.notAfter).getTime () - new Date ().getTime ())/(1000*60*60*24*365));

    let serviceKeys = await redis.keys ('service:*');
    for (let key of serviceKeys) {
        log.debug ('fetching vhost for', key);
        let vHost = await redis.get (key);
        log.debug ('cheking cert for vhost', vHost);
        if (!await dbHasCurrentCert (vHost)) {
            // we need to fetch a cert and insert it into the database
            await certify (getVHost (service));
        }
    }

    log.debug ('looking for vhosts to prune');
    // get each current service vhost
    const serviceVHosts = [];
    for (let key of serviceKeys) {
        let vHost = await redis.get (key);
        serviceVHosts.push (vHost);
    }
    log.debug ('found', serviceVHosts.length, 'service vhosts');
    // get all the vhosts from the db
    const dbVHosts = (await redis.keys ('vhost:*')).map (key => key.replace ('vhost:', ''));
    log.debug ('found', dbVHosts.length, 'db vhosts');
    // for each vhost from the db
    for (let vHost of dbVHosts) {
        if (!serviceVHosts.includes (vHost)) {
            log.debug ('removing vHost', vHost);
            let res = await redis.del (`vhost:${vHost}`);
            log.trace (res);
        }
    }
}

// check if a cert expiration is beyond a certain safeguard
async function dbHasCurrentCert (fqdn) {
    log.debug (`checking for current certificates for ${fqdn}`);
    if (!(await redis.exists (`cert${process.env.AGASSI_ACME_PRODUCTION ? '' : '.staging'}:${fqdn}`))) {
        log.debug ('could not find cert for domain ' + fqdn);
        return false;
    }
    log.debug ('found cert');
    let msUntilExpiration = await redis.pttl (`cert${process.env.AGASSI_ACME_PRODUCTION ? '' : '.staging'}:${fqdn}`);
    let daysUntilExpiration = msUntilExpiration / msInDay;
    log.debug ('days until expiration ' + daysUntilExpiration);
    if (daysUntilExpiration < Number.parseInt (process.env.AGASSI_EXPIRATION_THRESHOLD)) {
        log.debug ('cert is past the expiration threshold');
        return false;
    }
    log.debug ('domain ' + fqdn + ' has current cert');
    return true;
}

function sleep (ms) {
    return new Promise ((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function fetchCertificate (fqdn) {
    const account = await acmeClient.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${process.env.AGASSI_LETS_ENCRYPT_EMAIL}`]
    });
    log.debug ('creating certificate order')
    const order = await acmeClient.createOrder({
        identifiers: [
            { type: 'dns', value: fqdn },
        ]
    });

    log.debug ('fetching authorizations');
    const authorizations = await acmeClient.getAuthorizations (order);
    log.debug ('finding dns challenge');
    const dnsChallenge = authorizations[0]['challenges'].find ((element) => element.type === 'dns-01');

    log.debug ('fetching key authorization');
    const keyAuthorization = await acmeClient.getChallengeKeyAuthorization(dnsChallenge);

    // set txt (ACME)
    log.debug ('setting txt record');
    const txtSet = await putTxtRecord (`_acme-challenge.${fqdn}`, keyAuthorization);
    log.trace (txtSet.data);

    // complete challenge
    log.debug ('completing challenge');
    const completion = await acmeClient.completeChallenge (dnsChallenge);

    // await validation
    log.debug ('awaiting validation...');
    // give the DNS records a few seconds to propagate
    await sleep (7500);
    let validation = await acmeClient.waitForValidStatus (dnsChallenge)

    log.debug ('creating csr');
    const [key, csr] = await acme.crypto.createCsr ({
        commonName: fqdn
    }, fs.readFileSync (process.env.AGASSI_DEFAULT_KEY_FILE));

    log.debug ('finalizing order')
    const finalized = await acmeClient.finalizeOrder (order, csr);

    log.debug ('fetching cert');
    let cert = await acmeClient.getCertificate (finalized);
    // I do not know why this is necessary, but getCertificate seems to return three of the same cert in one file.
    cert = cert.substring (0, cert.indexOf ('-----END CERTIFICATE-----')).concat ('-----END CERTIFICATE-----');

    return cert;
}

module.exports = {
    start,
    maintenance
};
