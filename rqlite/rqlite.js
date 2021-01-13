"use strict";
// rqlite client

const axios = require ('axios');

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

module.exports = {

    initialize: (address) => {

    this.client = axios.create ({
            baseURL: `http://${address}:4001`,
            timeout: 2000,
            headers: { 'Content-Type' : 'application/json' }
        })
    },

    dbExecute: async function (_query, _consistency) {
        const method = 'post';
        const path = '/db/execute?timings' + '&' + parseConsistency (_consistency);
        const query = Array.isArray (_query) ? _query : new Array (_query);
        
        const response = (await this.client.request ({
            method: method,
            url: path,
            data: query
        })).data;
        response.results.forEach ((result) => {
            if (result.error) {
                throw new RqliteError (result.error);
            }
        });
        return response;
    },

    dbTransact: async function (_query, _consistency) {
        const method = 'post';
        const path = '/db/execute?timings&transaction' + '&' + parseConsistency (_consistency);
        const query = Array.isArray (_query) ? _query : new Array (_query);

        const response = (await this.client.request ({
            method: method,
            url: path,
            data: query
        })).data;
        response.results.forEach ((result) => {
            if (result.error) {
                throw new RqliteError (result.error);
            }
        });
        return response;
    },

    dbQuery: async function (_query, _consistency) {
        const method = 'post';
        const path = '/db/query?timings' + '&' + parseConsistency (_consistency);
        const query = Array.isArray (_query) ? _query : new Array (_query);
        
        const responseData = (await this.client.request ({
            method: method,
            url: path,
            data: query
        })).data;

        return parseQueryResults (responseData);
    },

    removeNode: async function (node) {
        const method = 'delete';
        const path = '/remove';
        return (await this.client.request ({
            method: method, 
            url: path, 
            data: {"id": node}
        })).data;
    },

    checkStatus: async function () {
        const method = 'get';
        const path = '/status';

        return (await this.client.request ({
            method: method,
            url: path,
        })).data;
    }
};