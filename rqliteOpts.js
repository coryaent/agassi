"use strict";
// rqlite client

module.exports.default = {
    baseURL: 'http://localhost:4001',
    timeout: 2000,
    headers: {"Content-Type": "application/json"},
    params: {"timings": true}
};
