"use strict";

const log = require ('../logger.js');
const client = require ('./client.js');
const Cache = require ('../cache.js');
const discovery = require ('../distribution/discovery.js');
const Certificate = require ('../certificate.js');

module.exports = async (domain) => {
    // do not crash on failure
    try {
        const order = await client.createOrder ({
            identifiers: [
                { type: 'dns', value: domain },
            ]
        });
        log.debug (`Adding new challenge for domain ${domain}...`);

        if (order.status === 'pending') {
            // get http authorization token and response
            const authorizations = await retry (() => client.getAuthorizations (order), RetryOptions);
            const httpChallenge = authorizations[0]['challenges'].find (
                (element) => element.type === 'http-01');

            const httpAuthorizationToken = httpChallenge.token;
            const httpAuthorizationResponse = await retry (() => client.getChallengeKeyAuthorization (httpChallenge), RetryOptions);

            // distribute the challenge token and response
            discovery.send ('challenge', JSON.stringify ({
                token: httpAuthorizationToken,
                response: httpAuthorizationResponse
            }));
            Cache.challenges.set (httpAuthorizationToken, httpAuthorizationResponse);

            // let the challenge settle
            log.debug ('Indicating challenge completion...');
            await retry (() => client.completeChallenge (httpChallenge), RetryOptions);
            await client.waitForValidStatus (httpChallenge);
        }

        if (order.status === 'pending' || order.status === 'ready') {

            const [key, csr] = await acme.forge.createCsr ({
                commonName: domain
            }, Config.defaultKey);
        
            // finalize the order and pull the cert
            log.debug (`Finalizing order for domain ${domain}...`);
            await retry (() => client.finalizeOrder (order, csr), RetryOptions);
        }

        // get final order (includes expiration time for certificate)
        const finalOrder = await retry (() => client.getOrder (order), RetryOptions);
        const expiration = finalOrder.expires;

        log.debug (`Downloading certificate for domain ${domain}...`);
        const certificate = await retry (() => client.getCertificate (order), RetryOptions);

        // add certificate to cache
        new Certificate (certificate, domain, expiration).cache ();
        log.info (`Certificate for domain ${domain} added to cache.`);

    } catch (error) {
        log.error (error.name);
        log.error (error.message);
    }
}