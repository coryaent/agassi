"use strict";

const objectHash = require ('object-hash');
const Cache = require ('./cache.js');
const toTime = require ('to-time');

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
        // set cert to expire in cache one day before actual expiration
        // this will stop clients from downloading certs that are about
        // to expire
        return Cache.certificates.set (this.hash (), this, this.calcTTL () - toTime ('1d').seconds ());
    }
}

module.exports = Certificate;