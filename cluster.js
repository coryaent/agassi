"use strict";

const Discover = require ('node-discover');
const print = require ('./print.js');
const { sleep } = require ('sleepjs');
const EventEmitter = require ('events');
const iprange = require ('iprange');

const rqlite = require ('./rqlite.js');
const rqlited = require ('./rqlited.js');

// default options
const options = {
    hostname: rqlited.uuid,
    port: 4000,
};

// maintain a list of Peers external to node-discover nodes
const Peers = new Set ();

// which node is master
var isMaster = false;

// callback on discover creation
async function initialize (error) {

    // catch error with cluster
    if (error) { print (error.name); print (error.message); process.exitCode = 1; };

    // looking for Peers
    print ('Looking for peers...');
    const retries = 3; let attempt = 1;
    while ((Peers.size < 1) && (attempt <= retries)) {
        // backoff
        await sleep ( attempt * 20 * 1000);
        if (Peers.size < 1) {
            if (Peers.size < 1) { print (`No peers found.`); }
            print (`Retrying (${attempt}/${retries})...`);
            attempt++;
        }
    }

    // either move on or quit
    if (Peers.size > 0) {
        // indicates completion status and joinHost
        // if this cluster node is master, "const master"
        // will be undefined here
        const joinAddress = Array.from (Peers.values ()).find ((node) => { return node.isMaster; });
        discovery.emit ('complete', options.address, joinAddress);
    } else {
        // no peers, no run
        if (Peers.size <= 0) { print ('Could not find any peers.'); };
        process.exitCode = 1;
        process.kill (process.pid);
    }
};

const discovery = new EventEmitter ()
.on ('complete', function spawnRqlited (listenAddress, joinAddress) {
    rqlited.spawn (listenAddress, joinAddress);
});

module.exports = {
    // emits 'ready' when rqlited is ready for connections
    rqlited: rqlited.node,
    
    start: (address, subnet) => {
        options.address = address;
        options.unicast = iprange (subnet);

    this.discover = new Discover (options, initialize)
        .on ('promotion', () => {
            isMaster = true;
        })
        .on ('demotion', () => {
            isMaster = false;
        })
        .on ('added', (node) => {
            print (`Found ${node.isMaster ? 'master' : 'node'} at ${node.address}.`);
            Peers.add (node.address);
            // node added to cluster
            if (node.advertisement == 'initialized') {
                // initialize new node in existing cluster
                print (`Joining rqlited cluster via ${node.address}...`);
                discovery.emit ('complete', address, node.address);
            }
        })
        .on ('removed', async function removeNode (node) {
            print (`Lost node ${node.hostName} at ${node.address}.`);
            Peers.delete (node.address);
            // if this node is master, remove the lost node
            if (isMaster) {
                print (`Removing node ${node.address}...`);
                await rqlite.cluster.remove (node.hostName);
            }
        });
    },

    isMaster: (address) => {
        // check if this node is master by default
        if (!address) {
            return isMaster;
        } else {
            // do not error if isMaster is called before discover is defined
            if (this.discover) {
                // iterate each node to find master
                let master = null;
                this.discover.eachNode (function findMaster (node) {
                    if (node.isMaster) {
                        master = node;
                    }
                });
                // return false if no master found or master.hostName != hostname
                if (master && master.address == address) {
                    return true;
                } else {
                    return false;
                }
            } else {
                // no discover, no master
                return false;
            }
        }
    },

    stop: () => {
        if (this.discover) {
            this.discover.stop ();
        };
        rqlited.kill ();
    }
}