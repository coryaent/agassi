"use strict";

const log = require ('./logger.js');

// check argv
if (!process.argv.includes ('--client') && !process.argv.includes ('--server')) {
    log.fatal ('must specify client or server mode');
    process.exit(1);
}
if (process.argv.includes ('--client') && process.argv.includes ('--server')) {
    log.fatal ('cannot run as client and server simultaneously');
    process.exit(1);
}

const isValidPath = require ('is-valid-path');
const isValidEmail = require ('is-valid-email');
const isValidDomain = require ('is-valid-domain');

// check ENV
if (process.argv.includes ('--client')) {
    if (!process.env.AGASSI_ACME_ACCOUNT_KEY_FILE || !isValidPath (process.env.AGASSI_ACME_ACCOUNT_KEY_FILE)) {
        log.fatal ('AGASSI_ACME_ACCOUNT_KEY_FILE is either not defined or invalid');
        process.exit(1);
    }
    if ( ( Math.round(process.env.AGASSI_DNS_TTL) < 300 ) || ( Math.round(process.env.AGASSI_DNS_TTL > 604800 ) ) ) {
        log.fatal ('AGASSI_DNS_TTL must be greater than or equal to 300 and less than or equal to 604800');
        process.exit(1);
    }
    if (!process.env.AGASSI_DEFAULT_KEY_FILE || !isValidPath (process.env.AGASSI_DEFAULT_KEY_FILE)) {
        log.fatal ('AGASSI_DEFAULT_KEY_FILE is either not defined or invalid');
        process.exit(1)
    }
    if (!isValidEmail (process.env.AGASSI_LETS_ENCRYPT_EMAIL)) {
        log.warn ('AGASSI_LETS_ENCRYPT_EMAIL appears to be invalid');
    }
    if (!process.env.AGASSI_TARGET_CNAME || !isValidDomain (process.env.AGASSI_TARGET_CNAME, { subdomain: true })) {
        log.fatal ('AGASSI_TARGET_CNAME is either undefined or invalid');
        process.exit(1);
    }
    const client = require ('./client');
    client.start ();
    client.maintenance.start ();
}

// if server start HTTPS server
if (process.argv.includes ('--server')) {
    const server = require ('./server');
    server.listen (443);
}
