"use strict";

const http = require ('http');

module.exports = new http.Agent ({
    keepAlive: true
});