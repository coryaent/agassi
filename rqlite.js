"use strict";
// rqlite client

const print = require ('./print.js');

const axios = require ('axios');

axios.defaults.baseURL = 'http://localhost:4001';
axios.defaults.timeout = 2000;
axios.defaults.headers.common['Content-Type'] = 'application/json';

module.exports.db = {
    execute: async function (...args) {
        try {
            const response = await axios.post ('/db/execute?timings', {
                data: JSON.stringify (args)
            });
            return response;
        } catch (error) {
            print (error.name);
            print (error.message);
        };
    },
    transact: async function (...args) {
        try {
            const response = await axios.post ('/db/execute?timings&transaction', {
                data: JSON.stringify (args)
            });
            return response;
        } catch (error) {
            print (error.name);
            print (error.message);
        };
    },
    query: async function (...args) {
        try {
            const response = await axios.post ('/db/query?timings', {
                data: JSON.stringify (args)
            });
            return response;
        } catch (error) {
            print (error.name);
            print (error.message);
        };
    }
};

module.exports.cluster = {
    remove: async function (node) {
        try {
            const response = await axios.post ('/remove', {
                data: `{
                    "id": "${node}"
                }`
            });
            return response;
        } catch (error) {
            print (error.name);
            print (error.message);
        };
    }
};