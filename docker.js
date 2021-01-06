"use strict";

const print = require ('./print.js');
const Config = require ('./config.js');

const Docker = require ('dockerode');
const DockerEvents = require ('docker-events');

// parse docker socket host, dropping protocol per
// https://github.com/apocas/docker-modem/issues/31#issuecomment-68103138
const dockerURL = new URL (Config.dockerSocket);

const docker = new Docker ({
    host: dockerURL.hostname,
    port: dockerURL.port
});

const dockerEvents = new DockerEvents ({
    docker: docker
});

module.exports = {
    API: docker,
    Events: dockerEvents
};