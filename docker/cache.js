"use strict";

// const Loki = require ('@lokidb/loki');
const Loki = require ('lokijs');
const cluster = require ('cluster');
const { tmpdir } = require ('os');
const { normalize } = require ('path');

const db = new Loki (normalize (`${tmpdir()}/agassi.json`));
const virtualHosts = db.addCollection ('virtualHosts', {
    indicies: ['domain']
});