"use strict";

const http = require ('http');
const phin = require ('phin');
const rr = require ('rr');

const shareAgent = new http.Agent ({
    keepAlive: true,
    maxSockets: 1
});

const peers = [];

async function pullCert (certHash) {
    try {
        return await phin ({
            url: 'http://' + rr (peers).address + ':1986/certs?q=' + certHash,
            parse: 'json',
            timeout: 1000
        });
    } catch {
        return Promise.any (peers.map (peer => {
            phin ({
                url: 'http://' + peer.address + ':1986/certs?q=' + certHash,
                parse: 'json',
                timeout: 2000
            });
        }));
    }
}