"use strict";

const NodeCache = require ('node-cache');
const toTime = require ('to-time');

const services = new NodeCache ({
    checkperiod: 0,
    useClones: false
})
// on service 'set' update virtualHosts
.on ('set', function updateVirtualHosts (serviceID, service) {
    service.virtualHosts.forEach (function checkAndUpdate (virtualHostURL) {
        // virtualHost is new
        if (!virtualHosts.has (virtualHostURL)) {
            virtualHosts.set (virtualHostURL, serviceID);
        } else {
            // virtual host is not new, check that it's pointing to this service
            if (virtualHosts.get (virtualHostURL) !== serviceID) {
                virtualHosts.set (virtualHostURL, serviceID);
            }
        }
    });
});

const virtualHosts = new NodeCache ({
    checkperiod: 0,
    useClones: false
})
// on virtualHosts 'set' check if new certs are needed
.on ('set', function ensureCertIsCurrent (virtualHostURL) {

});

const certificates = new NodeCache ({
    checkperiod: toTime ('1h').seconds (),
    useClones: false
})
// on certificate 'set' check that the latest is up-to-date
.on ('set', function updateLatestPointer (certHash, cert) {
    // check that the latest cert exists
    if (!latest.has (cert.domain)) {
        // set this as latest if no latest exists for this domain
        latest.set (cert.domain, cert.body, Math.floor (cert.expiration / 1000));
    } else {
        // check if this cert has a later expiration than the current latest
        if (cert.expiration > latest.getTtl (cert.domain)) {
            // this certificate is newer than the one in the latest cache
            latest.set (cert.domain, cert.body, Math.floor (cert.expiration / 1000));
        }
    }
});

const latest = new NodeCache ({
    useClones: false
});

module.exports = {
    services,
    virtualHosts,
    certificates,
    latest,
    challenges: new NodeCache ({
        stdTTL: toTime ('7d').seconds (),
        checkperiod: toTime ('1h').seconds (),
        useClones: false
    })
};