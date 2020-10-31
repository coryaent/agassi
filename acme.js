"use strict";

const acme = require ('acme-client');
const fs = require ('fs');

const key = fs.readFileSync (process.env.PWD + '/test.key', 'ascii');

(async () => { 
    /* Init client */
    const client = new acme.Client({
        directoryUrl: acme.directory.letsencrypt.staging,
        accountKey: key
    });
    console.log (`client: ${JSON.stringify(client, null, '\t')}`);

    /* Register account */
    const account = await client.createAccount({
        termsOfServiceAgreed: true,
        contact: ['mailto:steve@corya.me']
    });
    console.log (`account: ${JSON.stringify(account, null, '\t')}`);

    console.log (`key: ${key}`);

}) ();