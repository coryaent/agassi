"use strict";

const log = require ('./logger.js');
const acme = require ('acme-client');
const Config = require ('./config.js');
const EventEmitter = require ('events');
const rqlite = require ('./rqlite/rqlite.js');
const rqlited = require ('./rqlite/rqlited.js');
const Cluster = require ('./cluster.js');

const secondsInDay = 86400;
const msInHour = 3600000;

const client = new acme.Client ({
    directoryUrl: Config.acmeDirectory,
    accountKey: Config.acmeKey
});

// maintenance routine
var maintenanceInterval = undefined;

async function performMaintenance () {

    if (rqlited.isLeader ()) {
        log.debug ('Performing maintenance on certificate and service tables...');
        const serviceQueryResponse = await rqlite.dbQuery ('SELECT domain FROM services;');
        const serviceDomains = serviceQueryResponse.results.map (result => result.domain);
        log.debug (`Found ${serviceDomains.length} services in table in ${serviceQueryResponse.time / 1000} ms.`);

        const allCertQueryResponse = await rqlite.dbQuery (`SELECT certificate, expiration, domain FROM certificates;`, 'strong');
        const allCerts = allCertQueryResponse.results;
        log.debug (`Found ${allCerts.length} certificates in table in ${allCertQueryResponse.time / 1000} ms.`);

        // cleanup expired certs
        for (let cert of allCerts) {
            const unixTime = Math.floor (Date.now () / 1000);
            // if cert is expired
            if (cert.expiration < unixTime) {
                // remove cert from db
                const executionResponse = await rqlite.dbExecute (`DELETE FROM certificates WHERE certificate = '${cert.certificate}';`);
                log.debug (`Removed expired certificate for domain ${cert.domain} in ${executionResponse.time / 1000} ms.`);
            }
        }

        // get only the latest certs for domains in service
        const potentialRenewals = [];
        for (let domain of serviceDomains) {
            const latestCertQueryResponse = await rqlite.dbQuery (`SELECT expiration, domain FROM certificates
            WHERE domain = '${domain}' ORDER BY expiration DESC LIMIT 1;`, 'strong');
            if (latestCertQueryResponse.results.length > 0) {
                potentialRenewals.push (latestCertQueryResponse.results[0]);
            }
        }

        // check that the current time is past the expiration threshold
        const certsToRenew = potentialRenewals.filter (cert => {
            const unixTime = Math.floor (Date.now () / 1000);
            // latest cert for domain is past threshold
            return cert.expiration < unixTime + Config.certRenewalThreshold * secondsInDay;
        });
        log.debug (`Found ${certsToRenew.length} certificates whose expiration is past threshold.`);

        // get new certs as needed
        certsToRenew.map (cert => cert.domain).forEach (async (domain) => {
            await getCert (domain);
        });
    }
}

// check if a cert expiration is beyond a certain safeguard
async function hasCert (domain) {
    log.debug (`Checking for current certificates for domain ${domain}...`);
    const queryResponse = await rqlite.dbQuery (`SELECT expiration FROM certificates
    WHERE domain = '${domain}';`, 'strong');

    const hasCurrent = queryResponse.results.some (cert => {
        const unixTime = Math.floor (Date.now () / 1000);
        return cert.expiration > unixTime + Config.certExpirationSafeguard * secondsInDay;
    });

    hasCurrent ?
        log.debug (`Found one or more current certificates for domain ${domain}.`) :
        log.debug (`Could not find any current certificates for domain ${domain}.`);

    return hasCurrent;
}

// Stages of ACME cert. attainment:
// 1. Place order, may have status pending, ready, or valid
// 2. Create and fulfill challenge to go from pending to ready
// 3. Send CSR to go from ready to valid
// 4. Pull cert. for valid order
async function getCert (domain) {
    if (rqlited.isLeader ()) {
        try {
            const order = await client.createOrder ({
                identifiers: [
                    { type: 'dns', value: domain },
                ]
            });
            
            if (order.status === 'pending') {
                await fulfillChallenge (order);
            }

            if (order.status === 'ready' || order.status === 'valid') {
                await addCertToDB (order);
            }

        } catch (error) {
            log.error (error.name);
            log.error (error.message);
        }
    }
}

async function fulfillChallenge (order) {
    if (rqlited.isLeader ()) {
        try {
            const domain = order.identifiers[0].value;
            log.debug (`Adding new challenge for domain ${domain}...`);
            
            // get http authorization token and response
            const authorizations = await client.getAuthorizations (order);
            const httpChallenge = authorizations[0]['challenges'].find (
                (element) => element.type === 'http-01');

            const httpAuthorizationToken = httpChallenge.token;
            const httpAuthorizationResponse = await client.getChallengeKeyAuthorization (httpChallenge);

            // respond to this token in particular
            Cluster.ChallengeResponses.once (httpAuthorizationToken, addCertToDB);

            // add challenge and response to db table
            const challengeInsertion = await rqlite.dbExecute (`INSERT INTO challenges 
                (token, response, acme_order)
                VALUES (
                    '${httpAuthorizationToken}', 
                    '${httpAuthorizationResponse}', 
                    '${JSON.stringify (order)}');`);
            log.debug (`Added challenge to database in ${challengeInsertion.time / 1000} ms.`);

            // let the challenge settle
            log.debug ('Indicating challenge completion...');
            await client.completeChallenge (httpChallenge);

        } catch (error) {
            log.error (error.name);
            log.error (error.message);
        }
    }
}

async function addCertToDB (order) {
    if (rqlited.isLeader ()) {
        try {
            const domain = order.identifiers[0].value;

            log.debug (`Adding certificate for domain ${domain}...`);

            if (order.status === 'pending') {
                const authorizations = await client.getAuthorizations (order);

                const httpChallenge = authorizations[0]['challenges'].find (
                    (element) => element.type === 'http-01');
                const token = httpChallenge.token;

                log.debug (`Awaiting valid status for domain ${domain}...`);
                await client.waitForValidStatus (httpChallenge);

                // remove challenge from table
                const challengeRemoval = await rqlite.dbExecute (`DELETE FROM challenges WHERE token = '${token}';`);
                log.debug (`Removed challenge for domain ${domain} in ${challengeRemoval.time / 1000} ms.`);
            }

            if (order.status === 'ready') {
                // challenge is complete and valid, send cert-signing request
                log.debug (`Creating CSR for domain ${domain}...`);
                const [key, csr] = await acme.forge.createCsr ({
                    commonName: domain
                }, Config.defaultKey);
            
                // finalize the order and pull the cert
                log.debug (`Finalizing order for domain ${domain}...`);
                await client.finalizeOrder (order, csr);
            }

            log.debug (`Downloading certificate for domain ${domain}...`);
            const certificate = await client.getCertificate (order);

            // calculate expiration date by adding 2160 hours (90 days)
            const jsTime = new Date (); // JS (ms)
            const expiration = Math.floor (jsTime.setUTCHours (jsTime.getUTCHours () + 2160) / 1000); // (UNIX (s))

            // add certificate to db table
            await rqlite.dbExecute (`INSERT INTO certificates (domain, certificate, expiration)
            VALUES ('${domain}', '${certificate}', ${expiration});`);

            log.info (`Certificate for domain ${domain} added to database.`);

        } catch (error) {
            log.error (error.name);
            log.error (error.message);
        }
    }
}

module.exports = {

    createAccount: async () => {
        log.debug (`Creating ACME account with email ${Config.acmeEmail.replace ('mailto:', '')}...`);
        await client.createAccount ({
            termsOfServiceAgreed: true,
            contact: [Config.acmeEmail]
        });
        log.debug (`ACME account created with email ${Config.acmeEmail.replace ('mailto:', '')}.`);
    },

    certify: async (domain) => {
        if (!(await hasCert (domain))) {
            await getCert (domain);
        }
    },

    Maintenance: {
        start: () => {
            if (!maintenanceInterval) {
                if (rqlited.isLeader ()) {
                    log.info ('Starting automatic certificate renewal...');
                }
                maintenanceInterval = setInterval (performMaintenance, Config.certMaintenanceInterval * msInHour);
            }
        },

        stop: () => {
            if (maintenanceInterval) {
                if (rqlited.isLeader ()) {
                    log.info ('Stopping automatic certificate renewal...');
                }
                clearInterval (maintenanceInterval);
                maintenanceInterval = undefined;
            }
        }
    }
};