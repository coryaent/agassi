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
*/

const log = require ('./logger.js');

const { parseAgassiService, isAgassiService, getAuth, getVHost, getOptions } = require ('./agassiService.js');
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

function start () {
    // listen for events
    docker.getEvents ({ filters: { type: ["service"]}}).then (async (events) => {
        events.on ('data', async (data) => {
            let res = null;
            let event = JSON.parse (data);
            await processEvent (event);
        });
        // add existing services
        let services = await docker.listServices ();
        for (let id of services.map (service => service.ID)) {
            let service = await docker.getService (id);
            service = await service.inspect ();
            let agassiService = parseAgassiService (service);
            log.debug ('parsed service ' + id);
            log.debug ('aggasi service:', agassiService);
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
    });
};

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

module.exports = {
    addExistingServices,
    start,
    maintenance
};

// for updating certificates and for adding services that were missed by events
var maintenance ={
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

async function addExistingServices () {
    // pull existing services
    log.debug ('adding existing services');
    docker.listServices ().then (async function (services) {
        log.debug ('found ' + services.length + ' services');
        for (let id of services.map (service => service.ID)) {
            log.debug ('checking service ' + id);
            let service = await docker.getService (id);
            service = await service.inspect ();
            log.debug ('parsed service ' + id);
            if (isAgassiService (service)) {
                log.trace ('found agassi service ' + id);
                log.trace ('vhost: ' + getVHost (service));
                log.trace ('auth: ' + getAuth (service));
                log.trace ('options:', getOptions (service));
                // adding service triggers a call to fetch the certificate
                // and add it to the database
                let res = await addService (service);
                log.debug (res);
                // set dns record
                await putCnameRecord (getVHost (service), process.env.AGASSI_TARGET_CNAME);
            }
        }
    });
};
async function watchEvents () {
    log.debug ('subscribing to events');
    docker.getEvents ({ filters: { type: ["service"]}}).then (events => {
        events.on ('data', async (data) => {
            let res = null;
            let event = JSON.parse (data);
            // log.trace (event);
            if (event.Action == 'create' || event.Action == 'update') {
                log.debug ('found new or updated service');
                let service = await docker.getService (event.Actor.ID);
                service = await service.inspect ();
                log.trace ('id: ' + event.Actor.ID);
                // if we have an agassi service
                if (isAgassiService (service)) {
                    log.debug ('found agassi service ' + event.Actor.ID);
                    log.trace ('vhost: ' + getVHost (service));
                    log.trace ('auth: ' + getAuth (service));
                    log.trace ('options:', getOptions (service));
                    await addService (service);
                    res = await putCnameRecord (getVHost (service), process.env.AGASSI_TARGET_CNAME);
                    log.debug (res.data);
                }
            }
            if (event.Action == 'remove') {
                if (await redis.exists (`service:${event.Actor.ID}`)) {
                    // remove cname and remove service from db
                    let vHost = await redis.get (`service:${event.Actor.ID}`);
                    // res = await deleteCnameRecord (vHost);
                    // log.debug (res.data.trim ());
                    res = await removeService (event.Actor.ID);
                    log.debug (res);
                }
            }
        });
    });
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

// perform maintenance (will be called at a regular interval)
async function performMaintenance () {
    log.debug ('performing maintenance');
    // remove services that are no longer in docker
    // pull existing services from db
    let dbServices = (await redis.keys ('service:*')).map (key => key.replace ('service:', ''));
    log.debug (`found ${dbServices.length} db services`, dbServices);

    // pull services from docker
    let dockerServices = (await docker.listServices ()).map (service => service.ID);
    log.debug (`found ${dockerServices.length} docker services`, dockerServices);

    // iterate through each db service and check that it still exists in docker x
    log.debug ('looking for services to prune');
    for (let id of dbServices) {
        if (!dockerServices.includes (id)) {
            // service only exists in the database, it needs to be pruned
            // do not remove the service and its vhost, the vhost may be used by an active service
            log.debug ('deleting service ' + id);
            let res = await redis.del ('service:' + id);
            log.trace (res);
        }
    }

    // now that they're pruned, fetch the service keys again
    // use keydb here or don't have too many services'
    log.debug ('checking for current certs');
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
    log.trace (`${fqdn} -> ${keyAuthorization}`);
    const txtSet = await putTxtRecord (`_acme-challenge.${fqdn}`, keyAuthorization);
    log.trace (txtSet.data);

    // complete challenge
    log.debug ('completing challenge');
    const completion = await acmeClient.completeChallenge (dnsChallenge);

    // await validation
    log.debug ('awaiting validation...');
    // await acmeClient.waitForValidStatus (dnsChallenge)
    // let validation = await retry (async function (retry, number) {
    //     log.info ('attempt number', number);
    //     return acmeClient.waitForValidStatus (dnsChallenge).catch (retry);
    // });
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

// const awaitValidStatus = async (dnsChallenge) =>
//     retry (async (dnsChallenge) => {
//         log.debug ('attempting to verify completion');
//         let validation = await client.waitForValidStatus (dnsChallenge);
//         return validation;
//     });
