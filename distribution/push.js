"use strict";

const discovery = require ('./discovery');
const Cache = require ('../cache.js');
const phin = require ('phin');
const retry = require ('@lifeomic/attempt').retry;
const agent = require ('./agent.js');

// push cert to all hosts
Cache.certificates.on ('set', push);

async function push (hash, certificate) {
    return Promise.all (discovery.peers ().map (peer => {
        retry (
            phin ({
                method: 'POST',
                url: `http://${peer.address}:${peer.port}/`,
                data: JSON.stringify ({
                    [hash]: certificate
                }),
                core: {
                    agent: agent
                }
            }),
        {
            // retry options
            timeout: 5000,
            factor: 1,
            delay: 1,
            maxAttempts: 3
        });
    }));
}