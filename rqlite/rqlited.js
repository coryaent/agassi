"use strict";

const log = require ('../logger.js');
const { spawn, execFileSync } = require ('child_process');
const EventEmitter = require ('events');
const axios = require ('axios');
const fs = require ('fs');
const { v4: uuidv4 } = require ('uuid');
const Config = require ('../config.js');

// create the self-owned data directory
try {
    execFileSync ('rqmkown');
} catch (error) {
    log.error ('Error running native initialization binary rqmkown.');
    throw error;
}

// fetch existing uuid or create a new one
const id = (function getUUID () {
    const idPath = '/data/rqlited.uuid';
    let uuid = undefined;
    if (fs.existsSync (idPath)) {
        log.debug (`Reading rqlited node id from path ${idPath}...`);
        uuid = fs.readFileSync (idPath, 'utf-8');
    } else {
        log.debug ('Generating new rqlited id...');
        uuid = uuidv4 ();
        fs.writeFileSync (idPath, uuid);
    }
    log.debug (`Got UUID ${uuid}.`);
    return uuid;
}) ();

async function pollLeadership (listenAddress) {
    try {
        const response = await axios.request ({
            url: `http://${listenAddress}:4001/status`,
            method: 'get',
            timeout: 500
        });
        if (response.data.store.raft.state == 'Leader') {
            return true;
        } else {
            return false;
        }
    } catch {
        return false;
    }
}

async function pollConnection (listenAddress) {
    try {
        const response = await axios.request ({
            url: `http://${listenAddress}:4001/status`,
            method: 'get',
            timeout: 500
        });
        if (response.data.node) {
            return true;
        } else {
            return false;
        }
    } catch {
        return false;
    }
}

// status of the rqlited child process
var readinessCheck = undefined;
var isConnected = undefined;
var wasConnected = undefined;
var connectionCheck = undefined;
var isLeader = undefined;
var leadershipCheck = undefined;

// emits ['spawned', 'ready', 'disconnected', 'reconnected']
const dStatus = new EventEmitter ();
// start check for readiness and leadership
dStatus.once ('spawned', (listenAddress) => {
    log.debug (`Starting polls for readiness and leadership of rqlited node on ${listenAddress}.`);
    // poll daemon for readiness
    readinessCheck = setInterval (async function checkReadiness () {
        if (await pollConnection (listenAddress) && typeof isLeader == 'boolean') {
            dStatus.emit ('ready', listenAddress);
        }
    }, 1000);
    // poll for leader status (unless standalone)
    if (!Config.standalone) {
        leadershipCheck = setInterval (async function checkLeadership () {
            isLeader = await pollLeadership (listenAddress);
        }, 1000);
    } else {
        isLeader = true;
    }
});
// start polling connection
dStatus.once ('ready', function startConnectionCheck (listenAddress) {
    // ready implies connected
    isConnected = true;
    // do not emit more 'ready' events
    if (readinessCheck && readinessCheck instanceof Timeout) {
        clearInterval (readinessCheck);
    }
    // do not poll for connection status if not in cluster
    if (!Config.standalone) {
        log.debug (`Starting poll for connection status of rqlited node on ${listenAddress}.`);
        // poll daemon for connection status
        connectionCheck = setInterval (async function checkConnection () {
            // remember the last connection status
            wasConnected = isConnected;
            isConnected = await pollConnection (listenAddress);

            // if connection status change
            if (isConnected != wasConnected) {
                // reconnection
                if (isConnected) {
                    dStatus.emit ('reconnected');
                } 
                // disconnection
                else {
                    dStatus.emit ('disconnected');
                }
            }
            
        }, 1000);
    }
});
// debug logging
dStatus.on ('reconnected', () => {
    log.debug ('Rqlited reconnected.');
});

dStatus.on ('disconnected', () => {
    log.debug ('Rqlited disconnected.');
});

module.exports = {
    uuid: id,
    // status of this node/instance/process of rqlited
    status: dStatus,

    isLeader: () => {
        if (typeof isLeader == 'boolean') {
            return isLeader;
        } else {
            return false;
        }
    },

    spawn: (listenAddress, joinAddress) => {
        // concat the arguments with defaults
        const dArgs = [
            '-node-id', id,
            '-http-addr', `${listenAddress}:4001`,
            '-raft-addr', `${listenAddress}:4002`,
            '/data/rqlited'
        ];
        // add host to join if there is one
        if (joinAddress) {
            dArgs.unshift ('-join', `http://${joinAddress}:4001`);
        }
        // make sure there is no spawn error
        let spawnError = null;
        
    this.d = spawn ('rqlited', dArgs, {
            stdio: ['ignore', 'inherit', 'inherit']
        })
        .on ('error', (error) => {
            spawnError = error;
            process.exitCode = 1;
            throw error;
        });

        setImmediate ((spawnError) => {
            if (!spawnError) {
                dStatus.emit ('spawned', listenAddress);
            }
        });
    },

    kill: () => {
        // kill child process
        if (this.d && this.d instanceof ChildProcess) {
            log.debug ('Stopping rqlited process...');
            this.d.kill ('SIGINT');
        }

        // stop any and all status checks
        if (readinessCheck && readinessCheck instanceof Timeout) {
            clearInterval (readinessCheck);
        }

        if (leadershipCheck && leadershipCheck instanceof Timeout) {
            clearInterval (leadershipCheck);
        }

        if (connectionCheck && connectionCheck instanceof Timeout) {
            clearInterval (connectionCheck);
        }
    }
};