"use strict";

const log = require ('./logger.js');
const Input = require ('./input.js');

const ip = require ('ip');

const { spawn, execFileSync } = require ('child_process');

const Discovery = require ('./discovery.js');
const Redis = require ('ioredis');
const KeyDB = new Redis ({
    lazyConnect: true
});

// process instances
const ActiveChildren = new Map ();

// create and take data directory as-needed
execFileSync ('datamkown');

process.on ('SIGINT', () => {
    log.info ('SIGINT ignored, use SIGTERM to exit.');
});

process.on ('SIGTERM', () => {
    log.info ('SIGTERM received, exiting...');
    Discovery.stop ();
    for (let p of ActiveChildren.values ()) {
        p.kill ();
    }
});

// start the local redis/keydb server
log.info ('Starting KeyDB server...');
ActiveChildren.set ('keydb-server', spawn ('keydb-server', [
    // find the IP address based on the CIDR
    '--bind', '127.0.0.1', getControlNetAddress (), 
    '--active-replica', 'yes',
    '--databases', '1'
], { stdio: ['ignore', 'inherit', 'inherit'] }));



const caddyOpts = [
    'docker-proxy',
    '-caddyfile-path', '/usr/local/src/Caddyfile',
    '-controller-network', Input.controllerNetwork,
    '-proxy-service-tasks', 'false'
];
if (Input.ingressNetworks) {
    caddyOpts.push ('-ingress-networks', Input.ingressNetworks);
}

// start the caddy server http(s) proxy
log.info ('Starting Caddy proxy...');
ActiveChildren.set ('caddy-server', spawn ('caddy', 
    caddyOpts.concat (['-mode', 'standalone']), { 
    stdio: ['ignore', 'inherit', 'inherit'],
    uid: 0,
    gid: 0 
}));

// start discovery
log.info ('Starting automatic discovery...');
Discovery.start ({
    broadcast: ip.cidrSubnet (Input.controllerNetwork).broadcastAddress,
    port: 6379,
    address: getControlNetAddress ()
})
// sync keydb on discovery.add and run caddy server
.on ('added', async (peer) => {
    log.info (`Found peer at ${peer.address}, adding replication...`);
    await KeyDB.replicaof (peer.address, peer.port);
    log.info ('Replication set.');
})
// run controller and server on discovery.master
// .on ('promotion', async () => {
//     log.info ('Node promoted, setting KeyDB to master...');
//     await KeyDB.replicaof ('NO', 'ONE');
//     log.info ('Master set.');

//     log.info ('Starting Caddy controller...');
//     ActiveChildren.set ('caddy-controller', spawn ('caddy',
//     caddyOpts.concat (['-mode', 'controller']), { 
//         stdio: ['ignore', 'inherit', 'inherit'],
//         uid: 0,
//         gid: 0 
//     })
//     .on ('exit', function exitCaddyController () {
//         ActiveChildren.delete ('caddy-controller');
//     }));
// })
// stop controller on non-master instances
// .on ('demotion', () => {
//     log.info ('Node demoted.');
//     if (ActiveChildren.has ('caddy-controller')) {
//         ActiveChildren.get ('caddy-controller').kill ();
//     }
// });

function getControlNetAddress () {
    return require ('@emmsdan/network-address').v4.find ((address) => {
        return ip.cidrSubnet (Input.controllerNetwork).contains (address);
    });
}