"use strict";

const log = require ('./logger.js');

const Redis = require ('ioredis')
const Docker = require ('dockerode');

// check argv
if (!process.argv.includes ('--client') && !process.argv.includes ('--server')) {
    log.fatal ('must specify client or server mode');
    process.exit (1);
}
if (process.argv.includes ('--client') && process.argv.includes ('--server')) {
    log.fatal ('cannot run as client and server simultaneously');
    process.exit (1);
}

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

    const { isAgassiService, getAuth, getVHost, getOptions } = require ('./agassiService.js');

    docker.getEvents ({ filters: { type: ["service"]}}).then (events => {
        events.on ('data', async (data) => {
            let event = JSON.parse (data);
            log.trace (event);
            if (event.Action == 'create' || event.Action == 'update') {
                let service = await docker.getService (event.Actor.ID);
                service = await service.inspect ();
                log.debug (service);
                // log.debug (parseServiceLabels (service));
                // log.debug (parseProxyOptions (parseServiceLabels (service)));
                log.debug ('vhost: ' + getVHost (service));
                log.debug ('auth: ' + getAuth (service));
                log.debug ('options:', getOptions (service));
                // if we have an agassi service
                if (isAgassiService (service)) {
                    log.debug ('found service, updating redis');
                    // `SET service:[service id] [vhost]`

                }
            }
            if (event.Action == 'remove') {
                // if this service exists in redis remove the
            }
        });
    });
}

// if server start HTTPS server
if (process.argv.includes ('--server')) {

}
