"use strict";


const Redis = require('ioredis')
const Docker = require ('dockerode');

const redis = new Redis({
    host: process.env.AGASSI_REDIS_HOST,
    port: process.env.AGASSI_REDIS_PORT
});

const docker = new Docker ({
    host: process.env.AGASSI_DOCKER_HOST,
    port: process.env.AGASSI_DOCKER_PORT,
    version: process.env.AGASSI_DOCKER_API_VERSION
});

(async () => {
    // ping pong
    console.log ('Pinging docker...');
    const pong = (await docker.ping ()).toString ();
    console.log (pong);
    console.log (await redis.ping ());

    setInterval (async () => {
        console.log ((await docker.ping ()).toString ());
    }, 10000);

    // watch services
    const events = await docker.getEvents ({ filters: { type: ["service"]}});
    events.on ('data', (data) => console.log (JSON.parse(data)));

}) ();
