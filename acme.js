"use strict";

const acme = require ('acme-client');
const fs = require ('fs');
const util = require('util');

const key = fs.readFileSync (process.env.PWD + '/test.key', 'ascii');

(async () => { 
    /* Init client */
    const client = new acme.Client({
        directoryUrl: acme.directory.letsencrypt.staging,
        accountKey: key
    });

    // const [acmeKey, acmeCSR] = await acme.forge.createCsr({
    //     commonName: 'example.com'
    // }, key);

    // console.log (`myKey:\n${key}`);
    // console.log (`acmeKey:\n${acmeKey}`);
    // console.log (`acmeCSR:\n${acmeCSR}`);


    /* Register account */
    const account = await client.createAccount({
        termsOfServiceAgreed: true,
        contact: ['mailto:steve@corya.me']
    });
    console.log (`account: ${JSON.stringify(account, null, '\t')}`);

    const order = await client.createOrder({
        identifiers: [
            { type: 'dns', value: 'stevecorya.com' },
            { type: 'dns', value: 'corya.me' }
        ]
    });
    console.log (order);

    const authorizations = await client.getAuthorizations(order);
    console.log (util.inspect(authorizations, false, null));

    const keyAuthorization = await client.getChallengeKeyAuthorization(authorizations[0]['challenges'][0]);
    console.log (authorizations[0]['challenges'][0]);
    console.log (keyAuthorization);
}) ();