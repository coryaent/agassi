"use strict";

const EventEmitter = require ('events');

class VirtualHost extends EventEmitter {
    constructor (domain, path, serviceID) {
        super ();
        this._domain = domain;
        this._path = path;
        this._serviceID = serviceID;
    }
}