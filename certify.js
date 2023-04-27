 "use strict";

const log = require ('./logger.js');

const acme = require ('acme-client');
const axios = require ('axios');
const forge = require ('node-forge');
const fs = require ('fs');
const retry = require ('async-retry');
const { X509Certificate } = require ('crypto');
const Redis = require ('ioredis');

const { putTxtRecord } = require ('./dns/dns.js');

function sleep (ms) {
    return new Promise ((resolve) => {
        setTimeout(resolve, ms);
    });
}

const acmeClient = new acme.Client({
    directoryUrl: process.env.AGASSI_ACME_PRODUCTION ? acme.directory.letsencrypt.production : acme.directory.letsencrypt.staging,
    accountKey: fs.readFileSync (process.env.AGASSI_ACME_ACCOUNT_KEY_FILE)
});

const redis = new Redis ({
    host: process.env.AGASSI_REDIS_HOST,
    port: process.env.AGASSI_REDIS_PORT
});

module.exports = async function (domain) {
    const account = await acmeClient.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${process.env.AGASSI_LETS_ENCRYPT_EMAIL}`]
    });
    log.debug ('creating certificate order')
    const order = await acmeClient.createOrder({
        identifiers: [
            { type: 'dns', value: domain },
        ]
    });

    log.debug ('fetching authorizations');
    const authorizations = await acmeClient.getAuthorizations (order);
    log.debug ('finding dns challenge');
    const dnsChallenge = authorizations[0]['challenges'].find ((element) => element.type === 'dns-01');

    log.debug ('fetching key authorization');
    const keyAuthorization = await acmeClient.getChallengeKeyAuthorization(dnsChallenge);

    // set txt (ACME)
    log.debug ('setting txt record');
    log.trace (`${domain} -> ${keyAuthorization}`);
    const txtSet = await putTxtRecord (`_acme-challenge.${domain}`, keyAuthorization);
    log.trace (txtSet.data);

    // complete challenge
    log.debug ('completing challenge');
    const completion = await acmeClient.completeChallenge (dnsChallenge);

    // await validation
    log.debug ('awaiting validation...');
    // await acmeClient.waitForValidStatus (dnsChallenge)
    // let validation = await retry (async function (retry, number) {
    //     log.info ('attempt number', number);
    //     return acmeClient.waitForValidStatus (dnsChallenge).catch (retry);
    // });
    await sleep (75000);
    let validation = await acmeClient.waitForValidStatus (dnsChallenge)

    log.debug ('creating csr');
    const [key, csr] = await acme.crypto.createCsr ({
        commonName: domain
    }, fs.readFileSync (process.env.AGASSI_DEFAULT_KEY_FILE));

    log.debug ('finalizing order')
    const finalized = await acmeClient.finalizeOrder (order, csr);

    log.debug ('fetching cert');
    let cert = await acmeClient.getCertificate (finalized);
    // I do not know why this is necessary, but getCertificate seems to return three of the same cert in one file.
    cert = cert.substring (0, cert.indexOf ('-----END CERTIFICATE-----')).concat ('-----END CERTIFICATE-----');

    log.debug ('reading expiration');
    const { validTo } = new X509Certificate (cert);
    const expiration = new Date (validTo);

    // remove challenge
    // log.debug ('removing challenge key');
    // const txtDelete = await deleteTxtRecord (`_acme-challenge.${domain}`);

    log.debug ('expiration ' + expiration);
    log.debug ('adding cert to redis');
    let res = await redis.set (`cert${process.env.AGASSI_ACME_PRODUCTION ? '' : '.staging'}:${domain}`, cert,
                            'PX', new Date (expiration).getTime () - new Date ().getTime ());
    log.debug (res);
}

// const awaitValidStatus = async (dnsChallenge) =>
//     retry (async (dnsChallenge) => {
//         log.debug ('attempting to verify completion');
//         let validation = await client.waitForValidStatus (dnsChallenge);
//         return validation;
//     });
