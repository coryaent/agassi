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
    version: 'v1.37'
});

(async () => {
    console.log ('Pinging docker...');
    console.log (await docker.ping ());

}) ();
