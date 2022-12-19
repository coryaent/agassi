"use strict";

const acme = require ('acme-client');
const forge = require ('node-forge');

var keys = forge.pki.rsa.generateKeyPair (4096);
var accountPrivateKey = forge.pki.privateKeyToPem(keys.privateKey);

const client = new acme.Client({
    directoryUrl: acme.directory.letsencrypt.staging,
    accountKey: accountPrivateKey
});


(async () => {
    const account = await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${process.env.AGASSI_EMAIL}`]
    });
    const order = await client.createOrder({
        identifiers: [
            { type: 'dns', value: process.env.AGASSI_DOMAIN },
        ]
    });
    console.log (order);


    const authorizations = await client.getAuthorizations(order);
    console.log (authorizations);

    const dnsChallenge = authorizations[0]['challenges'].find ((element) => element.type === 'dns-01');
    console.log (dnsChallenge);
}) ();

