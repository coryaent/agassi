"use strict";

const log = require ('./logger.js');

const Discover = require ('node-discover');
const { sleep } = require ('sleepjs');
const EventEmitter = require ('events');
const iprange = require ('iprange');

const ACME = require ('./acme.js');

const rqlite = require ('./rqlite.js');
const rqlited = require ('./rqlited.js');

// default options
const options = {
    hostname: rqlited.uuid,
    port: 4002,
};

// maintain a list of Peers external to node-discover nodes
const Peers = new Set ();

// which node is master
var isMaster = false;

// callback on discover creation
async function initialize (error) {

    if (error) { 
        process.exitCode = 1;
        throw error;
    }

    // looking for Peers
    log.debug ('Looking for peers...');
    const retries = 3; let attempt = 1;
    while ((Peers.size < 1) && (attempt <= retries)) {
        // backoff
        await sleep ( attempt * 20 * 1000);
        if (Peers.size < 1) {
            log.debug (`No peers found. Retrying (${attempt}/${retries})...`);
            attempt++;
        }
    }
    // indicates completion status and joinHost
    // if this cluster node is master, "const master"
    // will be undefined here
    const joinAddress = Array.from (Peers.values ()).find ((node) => { return node.isMaster; });
    discovery.emit ('complete', options.address, joinAddress);

    if (Peers.size == 0) { 
        log.warn ('Could not find any peers.'); 
    }
};

const discovery = new EventEmitter ()
.on ('complete', function spawnRqlited (listenAddress, joinAddress) {
    rqlited.spawn (listenAddress, joinAddress);
});

rqlited.status.once ('ready', () => {
    if (module.exports.discover && module.exports.discover instanceof Discover) {
        module.exports.discover.advertise ('initialized');
    }
});

module.exports = {
    // emits 'ready' when rqlited is ready for connections
    
    start: (address, subnet) => {
        log.debug ('Starting automatic discovery...');
        options.address = address;
        options.unicast = iprange (subnet);

    this.discover = new Discover (options, initialize)
        .on ('promotion', async () => {
            isMaster = true;
            await ACME.createAccount ();
        })
        .on ('demotion', () => {
            isMaster = false;
        })
        .on ('added', (node) => {
            log.debug (`Found ${node.isMaster ? 'master' : 'node'} at ${node.address}.`);
            Peers.add (node.address);
            // node added to cluster
            if (node.advertisement == 'initialized') {
                // initialize new node in existing cluster
                log.debug (`Joining rqlited cluster via ${node.address}...`);
                discovery.emit ('complete', address, node.address);
            }
        })
        .on ('removed', async function removeNode (node) {
            log.debug (`Lost node ${node.hostName} at ${node.address}.`);
            Peers.delete (node.address);
            // if this node is master, remove the lost node
            if (isMaster) {
                log.debug (`Removing node ${node.address}...`);
                await rqlite.cluster.remove (node.hostName);
            }
        });
    },

    isMaster: () => {
        return isMaster;
    },

    stop: () => {
        if (this.discover && this.discover instanceof Discover) {
            this.discover.stop ();
        }
        rqlited.kill ();
    }
}