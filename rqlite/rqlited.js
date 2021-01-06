"use strict";

const print = require ('../print.js');
const { spawn, execFileSync } = require ('child_process');
const { hostname } = require ('os');
const EventEmitter = require ('events');
const axios = require ('axios');
const fs = require ('fs');
const { v4: uuidv4 } = require ('uuid');

// create the self-owned data directory
try {
    execFileSync ('rqmkown');
} catch (error) {
    print ('Error running native initialization binary rqmkown.');
    process.exitCode = 1;
}

// fetch existing uuid or create a new one
const id = (function getUUID () {
    const idPath = '/data/rqlited.uuid';
    if (fs.existsSync (idPath)) {
        return fs.readFileSync (idPath, 'utf-8');
    } else {
        const uuid = uuidv4 ();
        fs.writeFileSync (idPath, uuid);
        return uuid;
    }
}) ();

async function isReady (listenAddress) {
    try {
        const response = await axios.request ({
            url: `http://${listenAddress}:4001/status`,
            method: 'get',
            timeout: 250
        });
        if (response.data.node.start_time) {
            return true;
        } else {
            return false;
        }
    } catch {
        return false;
    }
}

// status of the rqlited child process
const dStatus = new EventEmitter ();
var readinessCheck = null;
dStatus.once ('spawned', () => {
    // poll daemon for readiness
    readinessCheck = setInterval (async () => {
        if (await isReady ()) {
            dStatus.emit ('ready');
        }
    }, 500);
});
dStatus.once ('ready', () => {
    // stop the readiness check
    if (readinessCheck && readinessCheck instanceof Timeout) {
        clearInterval (readinessCheck);
    }
});

module.exports = {
    uuid: id,
    // status of this node/instance/process of rqlited
    node: dStatus,

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
            print (error.name);
            print (error.message);
            process.exitCode = 1;
        });

        setImmediate ((spawnError) => {
            if (!spawnError) {
                dStatus.emit ('spawned', listenAddress);
            }
        });
    },

    kill: () => {
        if (this.d && this.d instanceof ChildProcess) {
            this.d.kill ();
        }
    }
};