"use strict"; 

const log = require ('../logger.js');

const rqlite = require ('../rqlite/rqlite.js');

const http = require ('http');

const Server = http.createServer (async (request, response) => {
    // check request path
    const requestURL = new URL(request.url, `http://${request.headers.host}`);
    // if request is for ACME challenge
    if (requestURL.pathname && requestURL.pathname.startsWith ('/.well-known/acme-challenge/')) {

        log.debug (`Received certificate challenge request for ${requestURL.hostname}.`);
        const token = requestURL.pathname.replace ('/.well-known/acme-challenge/', '');
        const queryResponse = await rqlite.dbQuery (`SELECT response FROM challenges
            WHERE token = '${token}';`);
        if (queryResponse.results.length > 0) {
            log.debug (`Got challenge response from database in ${queryResponse.time}.`)
            // write challenge response to request
            response.writeHead (200, {
                'Content-Type': 'text/plain'
            });
            response.write (queryResponse.results[0].response);
            response.end ();

            log.debug ('Sent challenge response.');
        } else {
            log.warn (`Could not find challenge response for ${requestURL.hostname}, ignoring request.`);
            return;
        }

    } else {

        // redirect to https
        const redirectLocation = "https://" + request.headers['host'] + request.url;
        response.writeHead(301, {
            "Location": redirectLocation
        });
        response.end();

    };
}).on ('listening', () => {
    log.info ('HTTP server started.');
}).on ('close', () => {
    log.info ('HTTP server stopped.');
});

module.exports = {
    Server,

    start: () => {
        if (!Server.listening) {
            log.info ('Starting HTTP server...');
            Server.listen (80, null, (error) => {
                if (error) {
                    throw error;
                }
            })
        }
    },

    stop: () => {
        if (Server.listening) {
            log.info ('Stopping HTTP server...');
            Server.stop ();
        }
    }
};