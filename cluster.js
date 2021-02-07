"use strict";

const log = require ('./logger.js');

const Discover = require ('node-discover');
const { sleep } = require ('sleepjs');
const EventEmitter = require ('events');
const iprange = require ('iprange');

const rqlite = require ('./rqlite/rqlite.js');
const rqlited = require ('./rqlite/rqlited.js');
const Config = require('./config.js');

// default options
const options = {
    hostname: rqlited.uuid,
    port: 4002,
    nodeTimeout: 10 * 1000,
    ignoreInstance: false
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

    // log.debug ('Looking for peers...');
    const retries = 3; let attempt = 1;
    while ((Peers.size < 1) && (attempt <= retries)) {
        log.debug (`Looking for peers. Attempt (${attempt}/${retries})...`);
        // backoff
        await sleep ( attempt * 30 * 1000);
        if (Peers.size < 1) {
            attempt++;
        }
    }

    if (Peers.size == 0) { 
        log.warn ('Could not find any peers.'); 
    }

    // indicates completion status and joinHost
    // if this cluster node is master, "const joinAddress"
    // will be undefined here
    const joinAddress = isMaster ? undefined : Array.from (Peers.values ());
    discovery.emit ('complete', options.address, joinAddress);
};

const discovery = new EventEmitter ()
.once ('complete', async function spawnRqlited (listenAddress, joinAddress) {
    rqlited.spawn (listenAddress, joinAddress, false);
});

const RemovalTimeouts = new Map ();

async function removeNode (nodeID) {
    // if this node is master, remove the lost node
    if (RemovalTimeouts.has (nodeID)) {
        log.debug (`Removing node ${nodeID}...`);
        await rqlite.cluster.remove (nodeID);
        RemovalTimeouts.delete (nodeID);
    }
}

const ChallengeResponses = new EventEmitter ();

var discover = null;

module.exports = {
    
    start: (address, subnet, standalone) => {
        // start rqlited in standalone mode
        if (standalone === true) {
            log.debug ('Starting rqlited in standalone mode...');
            rqlited.spawn (andress, null, standalone);
            return;
        }
        // start automatic discovery
        log.debug ('Starting automatic discovery...');
        options.address = address;
        options.unicast = iprange (subnet);

    discover = new Discover (options, initialize)
        .on ('promotion', async () => {
            log.debug (`Node ${options.address} elected as cluster master.`);
            isMaster = true;
        })
        .on ('demotion', () => {
            log.debug (`Node ${options.address} demoted.`)
            isMaster = false;
        })
        .on ('added', (node) => {
            log.debug (`Found cluster discover ${node.isMaster ? 'master' : 'node'} at ${node.address}.`);
            Peers.add (node.address);
            // clear pending removal
            if (RemovalTimeouts.has (node.hostName)) {
                clearTimeout (RemovalTimeouts.get (node.hostName));
                RemovalTimeouts.delete (node.hostName);
            }
            // maybe join an existing cluster
            if (node.advertisement == 'ready' || node.advertisement == 'reconnected') {
                // initialize new node in existing cluster
                discovery.emit ('complete', options.address, node.address);
            }
        })
        .on ('removed', (node) => {
            log.debug (`Lost node ${node.hostName} at ${node.address}.`);
            Peers.delete (node.address);
            // set pending removal
            RemovalTimeouts.set (node.hostName, setTimeout (removeNode, 60 * 1000, node.hostName));
        });
        
        discover.join ('challenge.responses', (response) => {
            ChallengeResponses.emit (response.token, response.domain, response.token);
        });
    },

    ChallengeResponses,

    indicateChallengeResponse: (domain, token) => {
        if (!Config.standalone) {
            if (discover && discover instanceof Discover) {
                log.warn ('Cluster discovery has not been initialized.');
            } else {
                discover.send ('challenge.responses', {domain, token});
            }
        } else {
            ChallengeResponses.emit (token, domain, token);
        }
    },

    advertise: (advertisement) => {
        if (discover && discover instanceof Discover) {
            discover.advertise (advertisement);
            log.debug (`Set cluster discover advertisement to ${advertisement}.`);
        }
    },

    isMaster: () => {
        return isMaster;
    },

    stop: () => {
        if (discover && discover instanceof Discover) {
            log.debug ('Stopping cluster auto-discovery...');
            discover.stop ();
        }
        rqlited.kill ();
    }
}