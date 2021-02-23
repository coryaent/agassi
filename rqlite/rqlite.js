"use strict";
// rqlite client

const phin = require ('phin');
const retry = require ('p-retry');
const querystring = require ('querystring');

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

const Retries = 9;

const ClientDefaults = {
    "timeout": 10 * 1000,
    "followRedirects": true,
    "headers": { 'Content-Type' : 'application/json' },
    "parse": 'json'
};

const RetryOptions = {
    retries: Retries,
    onFailedAttempt: error => {
        log.warn (`Failed to connect with rqlited database. Retrying (${error.attemptNumber}/${Retries})...`);
    },
    minTimeout: 10 * 1000,
    factor: 1
};

module.exports = {

    initialize: (address) => {
        ClientDefaults.url = `http://${address}:4001`
    },

    dbExecute: async function (query, consistency) {
        const ClientOptions = Object.create (ClientDefaults);

        ClientOptions.method = 'POST';
        ClientOptions.url = ClientDefaults.url + '/db/execute?timings' + '&' + parseConsistency (consistency);
        ClientOptions.data = Array.isArray (query) ? query : new Array (query);
        
        const response = (await retry (() => phin (ClientOptions), RetryOptions)).body;

        response.results.forEach ((result) => {
            if (result.error) {
                throw new RqliteError (result.error);
            }
        });
        return response;
    },

    dbTransact: async function (query, consistency) {
        const ClientOptions = Object.create (ClientDefaults);

        ClientOptions.method = 'POST';
        ClientOptions.url = ClientDefaults.url + '/db/execute?timings&transaction' + '&' + parseConsistency (consistency);
        ClientOptions.data = Array.isArray (query) ? query : new Array (query);

        const response = (await retry (() => phin (ClientOptions), RetryOptions)).body;

        response.results.forEach ((result) => {
            if (result.error) {
                throw new RqliteError (result.error);
            }
        });
        return response;
    },

    dbQuery: async function (query, consistency) {
        const ClientOptions = Object.create (ClientDefaults);

        ClientOptions.method = 'GET';
        ClientOptions.url = ClientDefaults.url + '/db/query?timings' + '&' + parseConsistency (consistency) +
            '&' + querystring.stringify ({ q: query })

        // retry unless consistency is none
        let response = null;
        parseConsistency (consistency) == 'level=none' ?
            response = (await phin (ClientOptions)).body :
            response = (await retry (() => phin (ClientOptions), RetryOptions)).body;

        return parseQueryResults (response);
    },

    removeNode: async function (node) {
        const ClientOptions = Object.create (ClientDefaults);

        ClientOptions.method = 'DELETE';
        ClientOptions.url = ClientDefaults.url + '/remove';
        ClientOptions.parse = 'none';
        ClientOptions.data = { "id": node }
        
        return (await retry (() => phin (ClientOptions), RetryOptions)).body;
    },

    checkStatus: async function () {
        const ClientOptions = Object.create (ClientDefaults);

        ClientOptions.method = 'GET';
        ClientOptions.url = ClientDefaults.url + '/status';

        return (await phin (ClientOptions)).body;
    }
};