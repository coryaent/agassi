"use strict"; 

const print = require ('../print.js');

const rqlite = require ('../rqlite/rqlite.js');

const http = require ('http');

module.exports.defaults = http.createServer (async (request, response) => {
    // check request path
    const requestURL = new URL(request.url, `http://${request.headers.host}`);
    // if request is for ACME challenge
    if (requestURL.pathname && requestURL.pathname.startsWith('/.well-known/acme-challenge/')) {

        // pull challenge response from etcd
        const token = requestURL.pathname.replace('/.well-known/acme-challenge/', '');
        const value = (await etcd.getAsync (`${challengeDir}/${token}`)).node.value;
        const challengeResponse = JSON.parse (value).response;

        // write challenge response to request
        print (`responding to challenge request...`);
        response.writeHead(200, {
            'Content-Type': 'text/plain'
        });
        response.write (challengeResponse);
        response.end();

    } else {

        // redirect to https
        const redirectLocation = "https://" + request.headers['host'] + request.url;
        response.writeHead(301, {
            "Location": redirectLocation
        });
        response.end();

    };
})
.on ('error', (error) => {
    print (error.name);
    print (error.message);
    process.exitCode = 1;
});