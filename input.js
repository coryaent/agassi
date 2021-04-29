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
    if (i) return i
    else if (param.required)
        throw new InputError (param.required);
        else 
        throw new InputError ('Could not read required input parameter.');
}

class InputError extends Error {
    constructor (message) {
        super (message);
        this.name = 'InputError';
    }
}

// main
module.exports = {
    get foo () {
        return getInput ({
            envKey: ['FOO', 'foo'],
            argvKey: ['-f', '--foo'],
            endMark: '--',
            priority: 'argv',
            required: 'foo error'
        })
    },

    get bar () {
        return getInput ({
            envKey: ['BAR', 'bar'],
            argvKey: ['-b', '--bar'],
            defaultValue: 'I\'m here',
            endMark: '--',
            priority: 'argv',
        })
    },
}