"use strict";

const log = require ('./logger.js');
const Input = require ('./input.js');

const Dockerode = require ('dockerode');
const Docker = new Dockerode (() => {
    const dockerSocketURL = new URL (Input.dockerHost);
    if (dockerSocketURL.protocol.startsWith ('unix') || 
        dockerSocketURL.protocol.startsWith ('file')) {
        return {
            socketPath: dockerSocketURL.pathname
        };
    } else {
        return {
            host: dockerSocketURL.hostname,
            port: dockerSocketURL.port
        };
    }
});
const ip = require ('ip');

const { spawn } = require ('child_process');

const Discovery = require ('./discovery.js');
const Redis = require ('ioredis');
const KeyDB = new Redis ();

// process instances
const ActiveChildren = new Map ();

/*
    From all the networks, get one with label
        'caddy.network==controller'
    and one or more with label
        'caddy.network==ingress'
*/
Docker.listNetworks ().then (function main (networks) {
    // find the single controller network
    const controllerNetwork = networks.find ((network) => {
        return network.Labels && network.Labels[Input.labelPrefix + '.network'] == 'controller';
    });
    // get the subnet and address parameters from the controller network
    const controllerSubnet = controllerNetwork ? 
        controllerNetwork.IPAM.Config[0].Subnet : 
        Input.controllerNetwork;
    const controllerAddress = require ('@emmsdan/network-address').v4.find ((address) => {
        return ip.cidrSubnet (controllerSubnet).contains (address);
    });

    // filter one or more ingress networks
    const ingressNetworks = networks.filter ((network) => {
        return network.Labels && network.Labels[Input.labelPrefix + '.network'] == 'ingress';
    });
    const ingressSubnets = ingressNetworks.map (network => network.IPAM.Config[0].Subnet);
    if (Input.ingressNetworks) {
        ingressSubnets.push (String (Input.ingressNetworks).split (','))
    }
    // adjust caddy options based on subnet discovery
    const caddyOpts = [
        'docker-proxy',
        '-caddyfile-path', '/Caddyfile',
        '-controller-network', controllerSubnet
    ];
    if (ingressSubnets.length > 0) {
        caddyOpts.push ('-ingress-networks', ingressSubnets.toString ());
    }

    // start the local redis/keydb server
    log.info ('Starting KeyDB server...');
    ActiveChildren.set ('keydb-server', spawn ('keydb-server', [
        '--bind', '127.0.0.1', controllerAddress, 
        '--active-replica', 'yes',
        '--databases', '1'
    ], { stdio: ['ignore', 'inherit', 'inherit'] }));

    // start the caddy server http(s) proxy
    log.info ('Starting Caddy proxy...');
    ActiveChildren.set ('caddy-server', spawn ('caddy', 
        Array.from (caddyOpts).push ('-mode', 'server'),
        { stdio: ['ignore', 'inherit', 'inherit'] }));

    // start discovery
    log.info ('Starting automatic discovery...');
    Discovery.start ({
        broadcast: ip.cidrSubnet (controllerSubnet).broadcastAddress,
        port: 6379,
        address: controllerAddress
    })
    // sync keydb on discovery.add and run caddy server
    .on ('added', async (peer) => {
        log.info (`Found peer at ${peer.address}, adding replication...`);
        await KeyDB.replicaof (peer.address, peer.port);
        log.info ('Replication set.');
    })
    // run controller and server on discovery.master
    .on ('promotion', async () => {
        log.info ('Node promoted, setting KeyDB to master...');
        await KeyDB.replicaof ('NO', 'ONE');
        log.info ('Master set.');

        log.info ('Starting Caddy controller...');
        ActiveChildren.set ('caddy-controller', spawn ('caddy',
            Array.from (caddyOpts).push ('-mode', 'controller'),
            { stdio: ['ignore', 'inherit', 'inherit'] })
        .on ('exit', function exitCaddyController () {
            ActiveChildren.delete ('caddy-controller');
        }));
    })
    // stop controller on non-master instances
    .on ('demotion', () => {
        log.info ('Node demoted.');
        if (ActiveChildren.has ('caddy-controller')) {
            ActiveChildren.get ('caddy-controller').kill ();
        }
    });
});

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