"use strict";

const http = require ('http');
const https = require ('https');

const plainServer = http.createServer ( function (request, response) {
    // You can define here your custom logic to handle the request
    // and then proxy the request.
    
    // console.log (request);
    console.log (new URL(request.url, `http://${request.headers.host}`));
    // console.log (JSON.stringify({
    //     protocol: request.protocol,
    //     host: request.host,
    //     path: request.path
    // }, null, '\t'));
    response.write (JSON.stringify(new URL(request.url, `http://${request.headers.host}`), null, '\t'));
    response.end();
});

const secureServer = https.createServer ( function (request, response) {
    // You can define here your custom logic to handle the request
    // and then proxy the request.

    // console.log (request);    
    console.log (new URL(request.url, `https://${request.headers.host}`));
    response.write (JSON.stringify(new URL(request.url, `https://${request.headers.host}`), null, '\t'));
    response.end();
});


console.log("listening on port 80 and 443...");
plainServer.listen(80);
secureServer.listen(443);