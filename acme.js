 "use strict";

const acme = require ('acme-client');
const axios = require ('axios');
const forge = require ('node-forge');
const fs = require ('fs');

var keys = forge.pki.rsa.generateKeyPair (4096);
var accountPrivateKey = forge.pki.privateKeyToPem(keys.privateKey);

const client = new acme.Client({
    directoryUrl: acme.directory.letsencrypt.staging,
    accountKey: accountPrivateKey
});

const auth = {
    username: process.env.AGASSI_MAILINABOX_EMAIL,
    password: fs.readFileSync (process.env.AGASSI_MAILINABOX_PASSWORD_FILE).toString ().trim ()
};

(async () => {
    const account = await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${process.env.AGASSI_LETS_ENCRYPT_EMAIL}`]
    });
    console.log ('order:');
    const order = await client.createOrder({
        identifiers: [
            { type: 'dns', value: process.env.AGASSI_DOMAIN },
        ]
    });
    console.log (order);


    console.log ('authorizations');
    const authorizations = await client.getAuthorizations (order);
    console.log (authorizations);
    console.log ('dnsChallenge:');
    const dnsChallenge = authorizations[0]['challenges'].find ((element) => element.type === 'dns-01');
    console.log (dnsChallenge);

    console.log ('keyAuthorization');
    const keyAuthorization = await client.getChallengeKeyAuthorization(dnsChallenge);
    console.log (keyAuthorization);

    // set txt (ACME)
    console.log ('Setting TXT...');
    const txtSet = await axios.put (`https://corya.net/admin/dns/custom/_acme-challenge.${process.env.AGASSI_DOMAIN}/txt`, keyAuthorization, {
        auth
    });
    console.log (txtSet.data);

    // complete challenge
    console.log ('Completing challenge...');
    const completion = await client.completeChallenge (dnsChallenge);
    console.log (completion);

    // await validation
    console.log ('Awaiting validation...');
    const validation = await client.waitForValidStatus (dnsChallenge);
    console.log (validation);

    // remove challenge
    console.log ('Removing challenge key...');
    const txtDelete = await axios.delete (`https://corya.net/admin/dns/custom/_acme-challenge.${process.env.AGASSI_DOMAIN}/txt`, {
        auth
    });
    console.log (txtDelete.data);

}) ();
