 "use strict";

const log = require ('./logger.js');

const acme = require ('acme-client');
const axios = require ('axios');
const forge = require ('node-forge');
const fs = require ('fs');

const accountKeys = forge.pki.rsa.generateKeyPair (4096);
const accountPrivateKey = forge.pki.privateKeyToPem (accountKeys.privateKey);

const client = new acme.Client({
    directoryUrl: acme.directory.letsencrypt.staging,
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
            { type: 'dns', value: process.env.AGASSI_DOMAIN },
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
    log.duebug (keyAuthorization);

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
    const validation = await client.waitForValidStatus (dnsChallenge);
    log.debug (validation);

    log.info ('creating csr');
    const [key, csr] = await acme.crypto.createCsr ({
        commonName: domain
    });
    log.info ('finalizing arder')
    const finalized = await client.finalizeOrder (order, csr);
    log.debug (finalized);

    log.info ('fetching cert');
    const cert = await client.getCertificate (finalized);

    // remove challenge
    log.info ('removing challenge key');
    const txtDelete = await axios.delete (`https://corya.net/admin/dns/custom/_acme-challenge.${domain}/txt`, {
        auth
    });
    log.debug (txtDelete.data);

}
