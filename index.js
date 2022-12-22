"use strict";


const Redis = require ('ioredis')
const Docker = require ('dockerode');

// check argv
if (!process.argv.includes ('--client') && !process.argv.includes ('--server')) {
    console.error ('must specify client or server mode');
    process.exit (1);
}
if (process.argv.includes ('--client') && process.argv.includes ('--server')) {
    console.error ('cannot run as client and server simultaneously');
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
    version: 'v1.37'
});

// if client start monitoring docker socket
if (process.argv.includes ('--client')) {
    docker.getEvents ({ filters: { type: ["service"]}}).then (events => {
        events.on ('data', async (data) => {
            let event = JSON.parse (data);
            console.log (event);
            if (event.Action == 'create' || event.Action == 'update') {
                let service = await docker.getService (event.Actor.ID);
                service = await service.inspect ();
                console.log (service);
                console.log (parseServiceLabels (service));
                console.log (parseProxyOptions (parseServiceLabels (service)));
            }
            if (event.Action == 'remove') {
            }
        });
    });
}

// if server start HTTPS server
if (process.argv.includes ('--server')) {

}
