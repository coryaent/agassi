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


// if client start monitoring docker socket
if (process.argv.includes ('--client')) {
    if (!process.env.AGASSI_ACME_ACCOUNT_KEY_FILE || !isValidPath (process.env.AGASSI_ACME_ACCOUNT_KEY_FILE)) {
        log.fatal ('AGASSI_ACME_ACCOUNT_KEY_FILE is either not defined or invalid');
    }
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

    if (!process.env.AGASSI_TARGET_CNAME || !isValidDomain (process.env.AGASSI_TARGET_CNAME, { subdomain: true })) {
        log.fatal ('AGASSI_TARGET_CNAME is either undefined or invalid');
        process.exit (1);
    }
    const client = require ('./client');
    client.addExistingServices ();
    client.listen ();
    client.maintenance.start ();
}

// if server start HTTPS server
if (process.argv.includes ('--server')) {
    const server = require ('./server');
    server.listen (443);
}
