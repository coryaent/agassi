"use strict";

const objectHash = require ('object-hash');
const Cache = require ('./cache.js');

class Certificate {
    constructor (body, domain, expiration) {
        this.body = Buffer.from (body);
        this.domain = domain;
        this.expiration = Date.parse (expiration);
    }
    
    hash () {
        return objectHash (this, {algorithm: 'md5'});
    }

    calcTTL () {
        return Math.floor ((this.expiration - Date.now ()) / 1000);
    }

    cache () {
        // set cert to expire in cache one hour before actual expiration
        return Cache.certificates.set (this.hash (), this, this.calcTTL () - 3600);
    }
}

module.exports = Certificate;