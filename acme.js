"use strict";

const acme = require ('acme-client');
const fs = require ('fs');
const util = require('util');
const print = require ('./print.js');
const http = require ('http');

const accountKey = fs.readFileSync ('/home/steve/Projects/reimagined-invention/staging.key', 'utf-8');
const testKey = fs.readFileSync ('/home/steve/Projects/reimagined-invention/test.key', 'utf-8');

const ChallengeResponses = new Map ();

http.createServer (async (request, response) => {
    // check request path
    print ('received http request');
    const requestURL = new URL(request.url, `http://${request.headers.host}`);
    print (requestURL);
    if (requestURL.pathname && requestURL.pathname.startsWith('/.well-known/acme-challenge/')) {
        // process ACME validation
        const token = requestURL.pathname.replace('/.well-known/acme-challenge/', '');
        print (`responding to token ${token} ...`);
        // const value = await etcd.getAsync (`${challengeDir}/${token}`);
        const challengeResponse = ChallengeResponses.get (token);
        print (`responding with value ${challengeResponse}`);
        // const challengeResponse = JSON.parse (value).response;
        response.writeHead(200, {
            'Content-Type': 'text/plain'
        });
        response.write (challengeResponse);
        response.end();
    };
})
.listen (80);

(async () => { 
    /* Init client */
    const client = new acme.Client({
        directoryUrl: acme.directory.letsencrypt.staging,
        accountKey
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
        ]
    });
    console.log (order);

    const authorizations = await client.getAuthorizations(order);
    console.log (util.inspect(authorizations, false, null));

    const httpChallenge = authorizations[0]['challenges'].find ((element) => element.type === 'http-01');

    const httpAuthorizationToken = httpChallenge.token;
    const keyAuthorizationResponse = await client.getChallengeKeyAuthorization(httpChallenge);
    console.log (httpAuthorizationToken);
    console.log (keyAuthorizationResponse);
    ChallengeResponses.set (httpAuthorizationToken, keyAuthorizationResponse);

    print (`completing challenge...`);
    const completion = await client.completeChallenge(httpChallenge);
    print (completion);

    print (`awaiting validation...`);
    const validation = await client.waitForValidStatus(httpChallenge);
    print (validation);

    print (`finalizing order...`);
    const [anotherKey, csr] = await acme.forge.createCsr({
        commonName: 'stevecorya.com'
    }, testKey);
    print (`csr:`);
    print (`\n${csr.toString()}`);
    print (`key copy:`);
    print (`\n${anotherKey.toString()}`);
    print (`key:`);
    print (`\n${testKey.toString()}`);
    const finalization = await client.finalizeOrder(order, csr);
    print (`finalization:`);
    print (finalization);

    const cert = await client.getCertificate(order);
    print (`cert:`);
    print (cert);
}) ();