"use strict";
// rqlite client

const print = require ('./print.js');
const { hostname } = require ('os');

const axios = require ('axios');

axios.defaults.baseURL = `http://${hostname()}:4001`;
axios.defaults.timeout = 2000;
axios.defaults.headers.common['Content-Type'] = 'application/json';

class ParseError extends Error {
    constructor (message) {
      super (message);
      this.name = 'InvalidParseConsistency';
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

async function request (path, query) {
    try {
        const response = await axios.post (path, {
            data: query
        });
        return response;
    } catch (error) {
        print (error.name);
        print (error.message);
    };
}

module.exports.db = {
    execute: async function (query, consistency) {
        const path = '/db/execute?timings' + '&' + parseConsistency (consistency);
        const response = await request (path, JSON.stringify (query));
        return response;
    },
    transact: async function (query, consistency) {
        const path = '/db/execute?timings&transaction' + '&' + parseConsistency (consistency);
        const response = await request (path, JSON.stringify (query));
        return response;
    },
    query: async function (query, consistency) {
        const path = '/db/query?timings' + '&' + parseConsistency (consistency);
        const response = await request (path, JSON.stringify (query));
        return response;
    }
};

module.exports.cluster = {
    remove: async function (node) {
        const path = '/remove';
        const response = await request (path, `{ "id": "${node}" }`);
        return response;
    }
};