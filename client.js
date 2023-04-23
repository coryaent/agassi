 "use strict";

// const log = require ('./logger.js');

const { isAgassiService, getAuth, getVHost, getOptions } = require ('./agassiService.js');
const { putCnameRecord } = require ('./dns/dns.js');
const certify = require ('./certify.js');
const Redis = require ('ioredis');
const Docker = require ('dockerode');

// initialization
const docker = new Docker ({
    host: process.env.AGASSI_DOCKER_HOST,
    port: process.env.AGASSI_DOCKER_PORT,
    version: process.env.AGASSI_DOCKER_API_VERSION
});
const redis = new Redis ({
    host: process.env.AGASSI_REDIS_HOST,
    port: process.env.AGASSI_REDIS_PORT
});
const msInDay = 86400000;
var maintenanceInterval = undefined;

module.exports = {
    addExistingServices: async function () {
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
                    let res = await addServiceToDB (service);
                    log.debug (res);
                    // set dns record
                    res = await putCnameRecord (getVHost (service), process.env.AGASSI_TARGET_CNAME);
                    log.debug (res.data.trim ());
                }
            }
        });
    },
    listen: async function () {
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
                        await addServiceToDB (service);
                        res = await putCnameRecord (getVHost (service), process.env.AGASSI_TARGET_CNAME);
                        log.debug (res.data.trim ());
                    }
                }
                if (event.Action == 'remove') {
                    if (await redis.exists (`service:${event.Actor.ID}`)) {
                        // remove cname and remove service from db
                        let vHost = await redis.get (`service:${event.Actor.ID}`);
                        // res = await deleteCnameRecord (vHost);
                        // log.debug (res.data.trim ());
                        res = await rmServiceAndVHost (event.Actor.ID);
                        log.debug (res);
                    }
                }
            });
        });
    },
    maintenance: {
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
    }
};

async function addServiceToDB (service) {

    log.debug ('adding service to DB');
    // `SET service:[service id] [vhost]`
    log.debug (`setting service ${service.ID} -> vhost ${getVHost (service)}`);
    let res = await redis.set (`service:${service.ID}`, getVHost (service) );
    log.debug (res);
    log.debug ('setting vhost ' + getVHost (service));
    res = await redis.hset (`vhost:${getVHost (service)}`, 'auth', getAuth (service), 'options', JSON.stringify (getOptions (service)));
    log.debug (res);
    if (!await redis.exists (`cert${process.env.AGASSI_ACME_PRODUCTION ? '' : '.staging'}:${getVHost(service)}`)) {
        // need to fetch and add the certificate
        await certify (getVHost (service));
    }
};

async function rmServiceAndVHost (id) {
    // leave the cert alone in this circumstance, it will expire on its own
    log.debug ('removing service', id, 'and its vhost from database');
    let vHost = await redis.get ('service:' + id);
    log.debug ('deleting vhost', vHost);
    let res = await redis.del ('vhost:' + vHost);
    log.trace (res);
    log.debug ('deleting service ' + id);
    res = await redis.del ('service:' + id);
    log.trace (res);
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
async function dbHasCurrentCert (domain) {
    log.debug (`checking for current certificates for ${domain}`);
    if (!(await redis.exists (`cert${process.env.AGASSI_ACME_PRODUCTION ? '' : '.staging'}:${domain}`))) {
        log.debug ('could not find cert for domain ' + domain);
        return false;
    }
    log.debug ('found cert');
    let msUntilExpiration = await redis.pttl (`cert${process.env.AGASSI_ACME_PRODUCTION ? '' : '.staging'}:${domain}`);
    let daysUntilExpiration = msUntilExpiration / msInDay;
    log.debug ('days until expiration ' + daysUntilExpiration);
    if (daysUntilExpiration < Number.parseInt (process.env.AGASSI_EXPIRATION_THRESHOLD)) {
        log.debug ('cert is past the expiration threshold');
        return false;
    }
    log.debug ('domain ' + domain + ' has current cert');
    return true;
};
