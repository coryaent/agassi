"use strict";

const log = require ('./logger.js');

// check argv
if (!process.argv.includes ('--client') && !process.argv.includes ('--server')) {
    log.fatal ('must specify client or server mode');
    process.exit (1);
}
if (process.argv.includes ('--client') && process.argv.includes ('--server')) {
    log.fatal ('cannot run as client and server simultaneously');
    process.exit (1);
}

const isValidPath = require ('is-valid-path');
const isValidEmail = require ('is-valid-email');
const isValidDomain = require ('is-valid-domain');

if (!process.env.AGASSI_DEFAULT_KEY_FILE || !isValidPath (process.env.AGASSI_DEFAULT_KEY_FILE)) {
    log.fatal ('AGASSI_DEFAULT_KEY_FILE is either not provided or invalid');
    process.exit (1);
}

if (!process.env.AGASSI_REDIS_HOST) {
    log.fatal ('AGASSI_REDIS_HOST is must be defined');
    process.exit (1);
}

const Redis = require ('ioredis')
const Docker = require ('dockerode');

// initialization
const redis = new Redis({
    host: process.env.AGASSI_REDIS_HOST,
    port: process.env.AGASSI_REDIS_PORT
});

const docker = new Docker ({
    host: process.env.AGASSI_DOCKER_HOST,
    port: process.env.AGASSI_DOCKER_PORT,
    version: process.env.AGASSI_DOCKER_API_VERSION
});

// if client start monitoring docker socket
if (process.argv.includes ('--client')) {
    if (!process.env.AGASSI_DOCKER_HOST) {
        log.fatal ('AGASSI_DOCKER_HOST must be defined');
        process.exit (1);
    }
    if (!process.env.AGASSI_LABEL_PREFIX) {
        log.fatal ('AGASSI_LABEL_PREFIX is required');
        process.exit (1);
    }
    if (!process.env.AGASSI_LETS_ENCRYPT_EMAIL || !isValidEmail (process.env.AGASSI_LETS_ENCRYPT_EMAIL)) {
        log.fatal ('AGASSI_LETS_ENCRYPT_EMAIL is either not provided or invalid');
        process.exit (1);
    }
    if (!process.env.AGASSI_MAILINABOX_EMAIL || !isValidEmail (process.env.AGASSI_MAILINABOX_EMAIL)) {
        log.fatal ('AGASSI_MAILINABOX_EMAIL is either not defined or not valid');
        process.exit (1);
    }
    if (!process.env.AGASSI_MAILINABOX_PASSWORD_FILE || !isValidPath (process.env.AGASSI_MAILINABOX_PASSWORD_FILE)) {
        log.fatal ('AGASSI_MAILINABOX_PASSWORD_FILE is either not provided or not valid');
        process.exit (1);
    }

    if (!process.env.AGASSI_TARGET_CNAME || !isValidDomain (process.env.AGASSI_TARGET_CNAME, { subdomain: true })) {
        log.fatal ('AGASSI_TARGET_CNAME is either undefined or invalid');
        process.exit (1);
    }

    const { isAgassiService, getAuth, getVHost, getOptions } = require ('./agassiService.js');
    const fetchCertificate = require ('./fetchCertificate.js');
    const { setCnameRecord,  deleteCnameRecord } = require ('./dnsRecord.js');

    // pull existing services
    docker.listServices ().then (async function (services) {
        // console.log (services);
        for (let id of services.map (service => service.ID)) {
            let service = await docker.getService (id);
            service = await service.inspect ();
            if (isAgassiService (service)) {
                // addServiceToDB
            }
        }
    });


    // subscribe to events
    // see https://github.com/apocas/dockerode/issues/635 to close listeners (to gracefully shutdown)
    docker.getEvents ({ filters: { type: ["service"]}}).then (events => {
        events.on ('data', async (data) => {
            let event = JSON.parse (data);
            // log.trace (event);
            if (event.Action == 'create' || event.Action == 'update') {
                let service = await docker.getService (event.Actor.ID);
                service = await service.inspect ();
                log.debug ('id: ' + event.Actor.ID);
                log.debug ('vhost: ' + getVHost (service));
                log.debug ('auth: ' + getAuth (service));
                log.debug ('options:', getOptions (service));
                // if we have an agassi service
                if (isAgassiService (service)) {
                    // addServiceToDB
                }
            }
            if (event.Action == 'remove') {
                // removeServiceFromDB
            }
        });
    });
}

// if server start HTTPS server
if (process.argv.includes ('--server')) {
    const server = require ('./server');
    server.listen (443);
}
