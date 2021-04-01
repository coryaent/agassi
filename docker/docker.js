"use strict";

const log = require ('./logger.js');
const Config = require ('./config.js');

const Docker = require ('dockerode');
const DockerEvents = require ('docker-events');

const rqlite = require ('./rqlite/rqlite.js');

const docker = new Docker (parseSocket (process.env.DOCKER_SOCKET_URL));
const dockerEvents = new DockerEvents ({docker: docker});

// parse docker socket host, dropping protocol per
// https://github.com/apocas/docker-modem/issues/31#issuecomment-68103138
function parseSocket (_dockerSocketURL) {
    const dockerSocketURL = new URL (_dockerSocketURL);
    if (dockerSocketURL.protocol.startsWith ('unix') || 
        dockerSocketURL.protocol.startsWith ('file')) {
        return {
            socketPath: dockerSocketURL.pathname
        };
    } else {
        return {
            host: dockerSocketURL.hostname,
            port: dockerSocketURL.port
        };
    }
}


module.exports = {
    api: docker,
    events: dockerEvents
};