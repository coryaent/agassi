"use strict";

const discovery =  requirre ('../distribution/discovery.js');
const toTime = require ('to-time');
const certify = require ('./certification.js');
const Cache = require ('../cache.js');
const URL = require ('url');
const pLimit = require ('p-limit');

var maintenanceInterval = undefined;

module.exports = {
    start: () => {
        if (!maintenanceInterval) {
            if (discovery.isMaster ()) {
                log.info ('Starting automatic certificate renewal...');
            }
            maintenanceInterval = setInterval (performMaintenance, Config.certMaintenanceInterval * msInHour);
        }
    },

    stop: () => {
        if (maintenanceInterval) {
            if (discovery.isMaster ()) {
                log.info ('Stopping automatic certificate renewal...');
            }
            clearInterval (maintenanceInterval);
            maintenanceInterval = undefined;
        }
    }
};

async function performMaintenance () {
    if (discovery.isMaster ()) {
        const concurrent = pLimit (1);
        const domainsInNeed = new Set ();
        Cache.virtualHosts.keys ().map (vHost => new URL (vHost).domain).forEach (domain => {
            if (!hasCurrentCert (domain)) {
                domainsInNeed.add (domain);
            }
        });
        await Promise.all (Array.from (domainsInNeed).map (domain => concurrent (certify (domain))));
    }
}

function hasCurrentCert (domain) {
    // cert is current if it expires in more than 7 days
    const hasCurrent = Cache.latest.getTtl (domain) > Date.now () + toTime ('7d').ms ();

    hasCurrent ?
        log.debug (`Found one or more current certificates for domain ${domain}.`) :
        log.debug (`Could not find any current certificates for domain ${domain}.`);

    return hasCurrent;
}