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

    cache () {
        let hash = this.hash ();
        if (Cache.certificates.set (hash, this, this.calcTTL ())) {
            // successfully added to cache, check if this is the latest cert for this domain
            if (Object.values (Cache.certificates.mget (Cache.certificates.keys ())).find ((certificate) => {
                certificate.domain === this.domain && certificate.expiration > this.expiration; })) {
                // this cert is not the latest
                return hash;
            } else {
                // this cert is the latest for the domain, allow extra time for TTL to expire before certificate
                if (Cache.latest.set (this.domain, this.body, this.calcTTL () - 600)) {
                    // successfully update latest cert for this domain
                    return hash;
                } else {
                    // could not cache latest
                    return false;
                }
            }
        } else {
            // could not cache certificate
            return false;
        }
    }

    calcTTL () {
        return Math.floor ((this.expiration - Date.now ()) / 1000);
    }
}

module.exports = Certificate;