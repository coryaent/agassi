"use strict";
// rqlite client

const axios = require ('axios');

const rqlite = axios.create ({
    baseURL: 'http://localhost:4001',
    timeout: 2000,
    headers: {"Content-Type": "application/json"},
    params: {"timings": true}
});

rqlite.interceptors.response.use (function (response) {
    return response;
}, function (error) {
    print (error.name);
    print (error.message);
});

module.exports.default = rqlite;
