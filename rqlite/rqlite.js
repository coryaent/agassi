"use strict";
// rqlite client

const phin = require ('phin');
const querystring = require('querystring');

class RqliteError extends Error {
    constructor (message) {
        super (message);
        this.name = 'RqliteError';
    }
}

function parseConsistency (consistency) {
    switch (consistency) {
        // weak by default
        case undefined:
        case 1:
        case 'weak':
        case 'WEAK':
            return 'level=weak';
    
        case null:
        case 0:
        case 'none':
        case 'NONE':
            return 'level=none';

        case 2:
        case 'strong':
        case 'STRONG':
            return 'level=strong';
        
        // only the above levels are valid
        default:
            throw new ParseError (`Consistency level ${consistency} is not valid.`);
    }
}

function parseQueryResults (responseData) {
    // parse results
    const organizedResults = {};
    const results = responseData.results[0];
    if (!results.values) {
        organizedResults.results = [];
    } else {
        organizedResults.results = results.values.map ((values) => {
                const resultObject = {};
                values.forEach ((value, index) => {
                        resultObject[results.columns[index]] = value;
                });
                return resultObject;
        });
    }
    // parse query time
    if (responseData.time) {
        organizedResults.time = responseData.time;
    }
    return organizedResults;
}

const defaults = {
    "timeout": 10 * 1000,
    "followRedirects": true,
    "headers": { 'Content-Type' : 'application/json' },
    "parse": 'json'
};

module.exports = {

    initialize: (address) => {
        defaults.url = `http://${address}:4001`
    },

    dbExecute: async function (query, consistency) {
        const options = Object.create (defaults);

        options.method = 'POST';
        options.url = defaults.url + '/db/execute?timings' + '&' + parseConsistency (consistency);
        options.data = Array.isArray (query) ? query : new Array (query);
        
        const response = (await phin (options)).body;

        response.results.forEach ((result) => {
            if (result.error) {
                throw new RqliteError (result.error);
            }
        });
        return response;
    },

    dbTransact: async function (query, consistency) {
        const options = Object.create (defaults);

        options.method = 'POST';
        options.url = defaults.url + '/db/execute?timings&transaction' + '&' + parseConsistency (consistency);
        options.data = Array.isArray (query) ? query : new Array (query);

        const response = (await phin (options)).body;

        response.results.forEach ((result) => {
            if (result.error) {
                throw new RqliteError (result.error);
            }
        });
        return response;
    },

    dbQuery: async function (query, consistency) {
        const options = Object.create (defaults);

        options.method = 'GET';
        options.url = defaults.url + '/db/query?timings' + '&' + parseConsistency (consistency) +
            '&' + querystring.stringify ({ q: query })
        
        const response = (await phin (options)).body;

        return parseQueryResults (response);
    },

    removeNode: async function (node) {
        const options = Object.create (defaults);

        options.method = 'DELETE';
        options.url = defaults.url + '/remove';
        options.parse = 'none';
        options.data = { "id": node }
        
        return (await phin (options)).body;
    },

    checkStatus: async function () {
        const options = Object.create (defaults);

        options.method = 'GET';
        options.url = defaults.url + '/status';

        return (await phin (options)).body;
    }
};