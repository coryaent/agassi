"use strict";

const getInput_ = require ('get-input');

/*
    add custom functionality and new error class
    for setting parameter values, e.g.
        }
            envKey: ['FOO', 'foo'],
            argvKey: ['-f', '--foo'],
            endMark: '--',
            priority: 'argv',
            required: 'foo error'
        }
        ... throws an error and
        {
            envKey: ['BAR', 'bar'],
            argvKey: ['-b', '--bar'],
            defaultValue: 'I\'m here',
            endMark: '--',
            priority: 'argv',
        }
        ... proceceeds without error.

*/
function getInput (param) {
    let i = getInput_ (param);
    if (i) return i;
    else if (param.required)
        throw new InputError (param.required);
        else 
        return undefined;
}

class InputError extends Error {
    constructor (message) {
        super (message);
        this.name = 'InputError';
    }
}

module.exports = {    
    /*
        Caddy
    */
    get caddyfilePath () {
        return getInput ({
            envKey: ['CADDY_DOCKER_CADDYFILE_PATH'],
            argvKey: ['-caddyfile-path', '--caddyfile-path'],
            endMark: '--',
            priority: 'argv',
            defaultValue: '/Caddyfile'
        })
    },

    get controllerNetwork () {
        return getInput ({
            envKey: ['CADDY_CONTROLLER_NETWORK'],
            argvKey: ['-controller-network', '--controller-network'],
            endMark: '--',
            priority: 'argv',
        })
    },

    get ingressNetworks () {
        return getInput ({
            envKey: ['CADDY_INGRESS_NETWORKS'],
            argvKey: ['-ingress-networks', '--ingress-networks'],
            endMark: '--',
            priority: 'argv'
        })
    },

    get labelPrefix () {
        return getInput ({
            envKey: ['CADDY_DOCKER_LABEL_PREFIX'],
            argvKey: ['-label-prefix', '--label-prefix'],
            endMark: '--',
            priority: 'argv',
            defaultValue: 'caddy'
        })
    },

    get dockerHost () {
        return getInput ({
            envKey: ['DOCKER_HOST'],
            argvKey: ['-h', '--docker-host'],
            endMark: '--',
            priority: 'argv',
            required: 'DOCKER_HOST must be set.'
        })
    },


    /*
        Agassi
    */
    get logLevel () {
        return getInput ({
            envKey: ['LOG_LEVEL'],
            argvKey: ['-l', '--log-level'],
            endMark: '--',
            priority: 'argv',
            defaultValue: 'info'
        })
    }
}

console.log (module.exports.dockerHost);