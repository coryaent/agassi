"use strict";

const log = require ('./logger.js');
const acme = require ('acme-client');
const Config = require ('./config.js');
const rqlite = require ('./rqlite/rqlite.js');
const rqlited = require ('./rqlite/rqlited.js');

const secondsInDay = 86400;
const msInHour = 3600000;

const client = new acme.Client ({
    directoryUrl: Config.acmeDirectory,
    accountKey: Config.acmeKey
});

var maintenanceInterval = undefined;

async function performMaintenance () {

    if (rqlited.isLeader ()) {
        const serviceQueryResponse = await rqlite.dbQuery ('SELECT domain FROM services;');
        const serviceDomains = serviceQueryResponse.results.map (result => result.domain);

        const certQueryResponse = await rqlite.dbQuery (`SELECT id, expiration, domain FROM certificates
        ORDER BY expiration DESC;`);
        const latestCerts = certQueryResponse.results;

        // cleanup expired certs
        latestCerts.forEach (async (cert) => {
            const unixTime = Math.floor (Date.now () / 1000);
            // if cert is expired
            if (cert.expiration < unixTime) {
                // remove cert from db
                const executionResponse = await rqlite.dbExecute (`DELETE FROM certificates WHERE id = ${cert.id};`);
                log.debug (`Removed expired certificate with id ${cert.id} for domain ${cert.domain} in ${executionResponse.time}.`);
            }
        });

        // check that the latest cert exists in docker services
        const potentialRenewals = latestCerts.find (cert => {
            // cert domain has current docker service
            return serviceDomains.includes (cert.domain);
        });

        // check that the current time is past the expiration threshold
        const certsToRenew = potentialRenewals.filter (cert => {
            const unixTime = Math.floor (Date.now () / 1000);
            // latest cert for domain is past threshold
            return cert.expiration < unixTime + Config.certRenewalThreshold * secondsInDay;
        });

        // get new certs as needed
        certsToRenew.map (cert => cert.domain).forEach (addNewCertToDB);
    }
}

async function hasCert (domain) {
    // check if a cert expiration is beyond a certain safeguard
    const queryResponse = await rqlite.dbQuery (`SELECT id, expiration FROM certificates
    WHERE domain = '${domain}';`);

    return queryResponse.results.some (cert => {
        const unixTime = Math.floor (Date.now () / 1000);
        return cert.expiration > unixTime + Config.certExpirationSafeguard * secondsInDay;
    });
}

async function addNewCertToDB (domain) {

    const order = await client.createOrder ({
        identifiers: [
            { type: 'dns', value: domain },
        ]
    });

    // get http authorization token and response
    const authorizations = await client.getAuthorizations (order);
    const httpChallenge = authorizations[0]['challenges'].find (
        (element) => element.type === 'http-01');
    const httpAuthorizationToken = httpChallenge.token;
    const httpAuthorizationResponse = await client.getChallengeKeyAuthorization (httpChallenge);

    // add challenge and response to db table
    await rqlite.dbExecute (`INSERT INTO challenges (domain, token, response)
    VALUES ('${domain}', '${httpAuthorizationToken}', '${httpAuthorizationResponse}');`);

    // db consensus means it's ready
    await client.completeChallenge (httpChallenge);
    await client.waitForValidStatus (httpChallenge);

    // challenge is complete and valid, send cert-signing request
    const [key, csr] = await acme.forge.createCsr ({
        commonName: domain
    }, Config.defaultKey);

    // finalize the order and pull the cert
    await client.finalizeOrder (order, csr);
    const certificate = await client.getCertificate (order);

    // remove challenge from table
    await rqlite.dbExecute (`DELETE FROM services WHERE token = '${httpAuthorizationToken}';`);

    // calculate expiration date by adding 2160 hours (90 days)
    const jsTime = new Date (); // JS (ms)
    const expiration = Math.floor (jsTime.setUTCHours (jsTime.getUTCHours () + 2160) / 1000); // (UNIX (s))

    // add certificate to db table
    await rqlite.dbExecute (`INSERT INTO certificates (domain, certificate, expiration)
    VALUES ('${domain}', '${certificate}', ${expiration});`);
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
            await addNewCertToDB (domain);
        }
    },

    maintenance: {
        start: () => {
            if (!maintenanceInterval) {
                maintenanceInterval = setInterval (performMaintenance, Config.certMaintenanceInterval * msInHour);
            }
        },

        stop: () => {
            if (maintenanceInterval && maintenanceInterval instanceof Timeout) {
                clearInterval (maintenanceInterval);
            }
        }
    }
};