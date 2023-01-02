 "use strict";

const log = require ('./logger.js');

const acme = require ('acme-client');
const axios = require ('axios');
const forge = require ('node-forge');
const fs = require ('fs');
const retry = require ('async-retry');

// this account can be recreated every time the process reloads
const accountKeys = forge.pki.rsa.generateKeyPair (4096);
const accountPrivateKey = forge.pki.privateKeyToPem (accountKeys.privateKey);

const client = new acme.Client({
    directoryUrl: process.env.AGASSI_ACME_PRODUCTION ? acme.directory.letsencrypt.production : acme.directory.letsencrypt.staging,
    accountKey: accountPrivateKey
});

const auth = {
    username: process.env.AGASSI_MAILINABOX_EMAIL,
    password: fs.readFileSync (process.env.AGASSI_MAILINABOX_PASSWORD_FILE).toString ().trim ()
};

module.exports = async function (domain) {
    const account = await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${process.env.AGASSI_LETS_ENCRYPT_EMAIL}`]
    });
    log.info ('creating certificate order')
    const order = await client.createOrder({
        identifiers: [
            { type: 'dns', value: domain },
        ]
    });
    log.debug (order);


    log.info ('fetching authorizations');
    const authorizations = await client.getAuthorizations (order);
    log.debug (authorizations);
    log.info ('finding dns challenge');
    const dnsChallenge = authorizations[0]['challenges'].find ((element) => element.type === 'dns-01');
    log.debug (dnsChallenge);

    log.info ('fetching key authorization');
    const keyAuthorization = await client.getChallengeKeyAuthorization(dnsChallenge);
    log.debug (keyAuthorization);

    // set txt (ACME)
    log.info ('setting txt record');
    const txtSet = await axios.put (`https://corya.net/admin/dns/custom/_acme-challenge.${domain}/txt`, keyAuthorization, {
        auth
    });
    log.debug (txtSet.data);

    // complete challenge
    log.info ('completing challenge');
    const completion = await client.completeChallenge (dnsChallenge);
    log.debug (completion);

    // await validation
    log.info ('awaiting validation');
    // await client.waitForValidStatus (dnsChallenge)
    // let validation = await retry (async function (retry, number) {
    //     log.info ('attempt number', number);
    //     return client.waitForValidStatus (dnsChallenge).catch (retry);
    // });
    let validation = await client.waitForValidStatus (dnsChallenge)
    //  let validation = await awaitValidStatus (dnsChallenge);
    log.debug (validation);

    log.info ('creating csr');
    const [key, csr] = await acme.crypto.createCsr ({
        commonName: domain
    }, fs.readFileSync (process.env.AGASSI_DEFAULT_KEY_FILE));

    log.info ('finalizing arder')
    const finalized = await client.finalizeOrder (order, csr);
    log.debug (finalized);
    // expiration at finalized.expires

    log.info ('fetching cert');
    let cert = await client.getCertificate (finalized);
    // I do not know why this is necessary, but getCertificate seems to return three of the same cert in one file.
    cert = cert.substring (0, cert.indexOf ('-----END CERTIFICATE-----')).concat ('-----END CERTIFICATE-----');

    // remove challenge
    log.info ('removing challenge key');
    const txtDelete = await axios.delete (`https://corya.net/admin/dns/custom/_acme-challenge.${domain}/txt`, {
        auth
    });
    log.debug (txtDelete.data);

    return [cert, finalized.expires];
}

const awaitValidStatus = async (dnsChallenge) =>
    retry (async (dnsChallenge) => {
        log.debug ('attempting to verify completion');
        let validation = await client.waitForValidStatus (dnsChallenge);
        return validation;
    });
