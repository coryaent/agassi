"use strict";

const NodeCache = require ('node-cache');

module.exports = {
    services: new NodeCache (),
    virtualHosts: new NodeCache (),
    challenges: new NodeCache (),
    certificates: new NodeCache (),
    latest: new NodeCache ()
};