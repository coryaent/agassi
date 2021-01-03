"use strict";

const print = require ('./print.js');
const { spawn, execFileSync } = require ('child_process');
const { hostname } = require ('os');
const EventEmitter = require ('events');
const axios = require ('axios');

try {
    execFileSync ('rqmkown');
} catch (error) {
    print ('Error running native initialization binary rqmkown.');
    process.exitCode = 1;
}

const rqlitedArgs = [
    '-http-adv-addr', `${hostname()}:4001`,
    '-raft-adv-addr', `${hostname()}:4002`,
    '/data'
];

async function isReady () {
    try {
        const response = await axios.request ({
            url: `http://${hostname()}:4001/status`,
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
})

module.exports = {
    // status of this node/instance/process of rqlited
    node: dStatus,

    // default listen address, should be changed by cluster
    address: '127.0.0.1',

    spawn: (joinHost) => {
        // concat the arguments with defaults
        const dArgs = [
            '-http-addr', `${this.address}:4001`,
            '-raft-addr', `${this.address}:4002`,
        ].concat (rqlitedArgs);
        // add host to join if there is one
        if (joinHost) {
            dArgs.unshift ('-join', `http://${joinHost}:4001`);
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
                dStatus.emit ('spawned');
            }
        });
    },

    kill: () => {
        if (this.d && this.d instanceof ChildProcess) {
            this.d.kill ();
        }
    }
};