"use strict";

const acme = require ('acme-client');
const Config = require ('./config.js');
const rqlite = require ('./rqlite.js');

const client = new acme.Client({
    directoryUrl: Config.acmeDirectory,
    accountKey: Config.acmeKey
});

const account = await client.createAccount({
    termsOfServiceAgreed: true,
    contact: ['mailto:test@example.com']
});

async function placeCertOrder (domain) {

    const order = await client.createOrder({
        identifiers: [
            { type: 'dns', value: domain },
        ]
    });

    // get http authorization token and response
    const authorizations = await client.getAuthorizations(order);
    const httpChallenge = authorizations[0]['challenges'].find (
        (element) => element.type === 'http-01');
    const httpAuthorizationToken = httpChallenge.token;
    const httpAuthorizationResponse = await client.getChallengeKeyAuthorization(httpChallenge);

    // add challenge and response to db
    await rqlite.execute (`INSERT INTO challenges (domain, token, response)
    VALUES ('${domain}', '${httpAuthorizationToken}', '${httpAuthorizationResponse}');`);
    await etcd.setAsync (`${challengeDir}/${httpAuthorizationToken}`, // key
        JSON.stringify({ // etcd value
            domain: domain,
            order: order,
            challenge: httpChallenge,
            response: httpAuthorizationResponse
        }
    ), { ttl: 864000 }); // 10-day expiration
};



module.exports = client;