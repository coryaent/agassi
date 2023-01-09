 "use strict";

const log = require ('./logger.js');

const { isAgassiService, getAuth, getVHost, getOptions } = require ('./agassiService.js');
const { putCnameRecord, deleteCnameRecord } = require ('./dnsRecord.js');
const fetchCertificate = require ('./fetchCertificate.js');
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
                    log.debug ('found agassi service ' + id);
                    log.debug ('vhost: ' + getVHost (service));
                    log.debug ('auth: ' + getAuth (service));
                    log.debug ('options:', getOptions (service));
                    // adding service triggers a call to fetch the certificate
                    // and add it to the database
                    let res = await addServiceToDB (service);
                    log.debug (res);
                    // set dns record
                    res = await putCnameRecord (getVHost (service));
                    log.debug (res);
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
                    log.debug ('id: ' + event.Actor.ID);
                    // if we have an agassi service
                    if (isAgassiService (service)) {
                        log.debug ('found agassi service ' + event.Actor.ID);
                        log.debug ('vhost: ' + getVHost (service));
                        log.debug ('auth: ' + getAuth (service));
                        log.debug ('options:', getOptions (service));
                        await addServiceToDB (service);
                        res = await putCnameRecord (getVHost (service));
                        log.debug (res);
                    }
                }
                if (event.Action == 'remove') {
                    // removeServiceFromDB
                    let vHost = await redis.get (`service:${event.Actor.ID}`);
                    await deleteCnameRecord (vHost);
                    res = await removeServiceFromDB (event.Actor.ID);
                    log.debug (res);
                }
            });
        });
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
    if (!await redis.exists (`cert:${getVHost(service)}`)) {
        // need to fetch and add the certificate
        let [cert, expiration] = await fetchCertificate (getVHost (service));
        log.debug ('expiration ' + expiration);
        log.debug ('adding cert to redis');
        res = await redis.set (`cert:${getVHost (service)}`, cert, 'PX', expiration);
        log.debug (res);
    }
};

async function removeServiceFromDB (id) {
    // leave the cert alone in this circumstance, it will expire on its own
    log.debug ('removing vhost');
    let vHost = await redis.get ('service:' + id);
    log.debug (vHost);
    let res = await redis.del ('vhost:' + vHost);
    log.debug (res);
    log.debug ('removing service ' + id);
    res = await redis.del ('service:' + id);
    log.debug (res);
};

// check if a cert expiration is beyond a certain safeguard
async function dbHasCurrentCert (domain) {
    log.debug (`checking for current certificates for ${domain}`);
    if (!(await redis.exists (`cert:${domain}`))) {
        log.debug ('could not find cert for domain ' + domain);
        return false;
    }
    log.debug ('found cert');
    let expiration = await redis.pttl (`cert:${domain}`);
    let daysUntilExpiration =  (expiration - new Date ().getTime ()) / msInDay;
    log.debug ('days until expiration ' + daysUntilExpiration);
    if (daysUntilExpiration < Number.parseInt (process.env.AGASSI_EXPIRATION_THRESHOLD)) {
        log.debug ('service is past the expiration threshold');
        return false;
    }
    log.debug ('domain ' + domain + ' has current cert');
    return true;
};
