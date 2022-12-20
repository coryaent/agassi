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


    const username = process.env.AGASSI_MAILINABOX_EMAIL;
    const password = fs.readFileSync ('./password.txt').toString ().trim ();
//    const res = await axios.get ('https://corya.net/admin/dns/custom', {
//        auth: {
//            username: username,
//            password: password
//        },
//    });
//    console.log (res.data);

    // set cname (not ACME)
    console.log ('Setting CNAME...');
    const cnameSet = await axios.put (`https://corya.net/admin/dns/custom/${process.env.AGASSI_DOMAIN}/cname`, 'ingress.corya.enterprises', {
        auth: {
            username: username,
            password: password
        }
    });
    console.log (cnameSet.data);


    // set txt (ACME)
    console.log ('Setting TXT...');
    const txtSet = await axios.put (`https://corya.net/admin/dns/custom/_acme-challenge.${process.env.AGASSI_DOMAIN}/txt`, keyAuthorization, {
        auth: {
            username: username, 
            password: password
        }
    });

    console.log (txtSet.data);
    // print records
    const res = await axios.get ('https://corya.net/admin/dns/custom', {
        auth: {
            username: username,
            password: password
        },
    });
    console.log (res.data);

    // complete challenge
    console.log ('Completing challenge...');
    const completion = await client.completeChallenge (dnsChallenge);
    console.log (completion);

    // await validation
    console.log ('Awaiting validation...');
    const validation = await client.waitForValidStatus (dnsChallenge);
    console.log (validation);

}) ();
