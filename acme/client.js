"use strict";

const acme = require ('acme-client');
const Config = require ('./config.js');

module.exports = new acme.Client ({
    directoryUrl: Config.acmeDirectory,
    accountKey: Config.acmeKey
});