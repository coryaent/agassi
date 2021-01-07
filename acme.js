"use strict";

const log = require ('./logger.js');
const acme = require ('acme-client');
const Config = require ('./config.js');
const rqlite = require ('./rqlite.js');

module.exports = {
    client: new acme.Client ({
        directoryUrl: Config.acmeDirectory,
        accountKey: Config.acmeKey
    }),

    createAccount: async (_email) => {
        if (!_email) {
            _email = Config.acmeEmail;
        }
        const email = _email.startsWith ('mailto:') ? _email : 'mailto:' + _email;
        log.debug (`Creating ACME account with email ${email.replace ('mailto:', '')}...`);
        await this.client.createAccount ({
            termsOfServiceAgreed: true,
            contact: [email]
        });
        log.debug (`ACME account created with email ${email.replace ('mailto:', '')}.`);
    },

    addNewCertToDB: async (domain) => {

        const order = await this.client.createOrder ({
            identifiers: [
                { type: 'dns', value: domain },
            ]
        });
    
        // get http authorization token and response
        const authorizations = await this.client.getAuthorizations (order);
        const httpChallenge = authorizations[0]['challenges'].find (
            (element) => element.type === 'http-01');
        const httpAuthorizationToken = httpChallenge.token;
        const httpAuthorizationResponse = await this.client.getChallengeKeyAuthorization (httpChallenge);
    
        // add challenge and response to db table
        await rqlite.execute (`INSERT INTO challenges (domain, token, response)
        VALUES ('${domain}', '${httpAuthorizationToken}', '${httpAuthorizationResponse}');`, 'strong');
    
        // db consensus means it's ready
        await this.client.completeChallenge (httpChallenge);
        await this.client.waitForValidStatus (httpChallenge);
    
        // challenge is complete and valid, send cert-signing request
        const [key, csr] = await acme.forge.createCsr ({
            commonName: domain
        }, Config.defaultKey);
    
        // finalize the order and pull the cert
        await this.client.finalizeOrder (order, csr);
        const certificate = await this.client.getCertificate (order);

        // remove challenge from table
        await rqlite.execute (`DELETE FROM services WHERE token = '${httpAuthorizationToken}';`);

        // calculate expiration date by adding 2160 hours (90 days)
        const now = new Date (); // JS (ms)
        const expiration = Math.floor (now.setUTCHours (now.getUTCHours () + 2160) / 1000); // (UNIX (s))

        // add certificate to db table
        await rqlite.execute (`INSERT INTO certificates (domain, certificate, expiration)
        VALUES ('${domain}', '${certificate}', ${expiration});`, 'strong');
    }
};