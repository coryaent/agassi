"use strict";
// rqlite client

const print = require ('./print.js');
const { hostname } = require ('os');

const axios = require ('axios');

const rqlite = axios.create ({
    baseURL: `http://${hostname()}:4001`,
    timeout: 2000,
    headers: { 'Content-Type' : 'application/json' }
});

// axios.defaults.baseURL = `http://${hostname()}:4001`;
// axios.defaults.timeout = 2000;
// axios.defaults.headers.common['Content-Type'] = 'application/json';

class ParseError extends Error {
    constructor (message) {
      super (message);
      this.name = 'InvalidConsistency';
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

async function attempt (method, path, query) {
    try {
        return await rqlite.request ({
            method: method,
            url: path,
            data: query
        });
    } catch (error) {
        print (error.name);
        print (error.message);
    };
}

module.exports.db = {
    execute: async function (_query, _consistency) {
        const method = 'post';
        const path = '/db/execute?timings' + '&' + parseConsistency (_consistency);
        const query = _query.isArray () ? _query : new Array (_query);
        return await attempt (method, path, query);
    },
    transact: async function (_query, _consistency) {
        const method = 'post';
        const path = '/db/execute?timings&transaction' + '&' + parseConsistency (_consistency);
        const query = _query.isArray () ? _query : new Array (_query);
        return await attempt (method, path, query);
    },
    query: async function (_query, _consistency) {
        const method = 'post';
        const path = '/db/query?timings' + '&' + parseConsistency (_consistency);
        const query = _query.isArray () ? _query : new Array (_query);
        return await attempt (method, path, query);
    }
};

module.exports.cluster = {
    remove: async function (node) {
        const method = 'post';
        const path = '/remove';
        return await attempt (method, path, {"id": node});
    }
};

module.exports.node = {
    status: async function () {
        const method = 'get';
        const path = '/status';
        return await attempt (method, path);
    }
}