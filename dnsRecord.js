"use strict";

const log = require ('./logger.js');

const axios = require ('axios');

const isValidDomain = require ('is-valid-domain');
const isValidIP = require ('validate-ip-node');

if (process.env.AGASSI_TARGET_ALIAS && process.env.AGASSI_TARGET_CNAME) {
    log.error ('AGASSI_TARGET_ALIAS and AGASSI_TARGET_CNAME cannot both be set');
    process.exit (1);
}

if (!isValidIP (process.env.AGASSI_TARGET_ALIAS)) {
    log.error ('AGASSI_TARGET_ALIAS is not a valid IP address');
    process.exit (1);
}

if (!isValidDomain (process.env.AGASSI_TARGET_CNAME)) {
    log.error ('AGASSI_TARGET_CNAME is not a valid domain');
    process.exit (1);
}

const auth = {
    username: process.env.AGASSI_MAILINABOX_EMAIL,
    password: fs.readFileSync (process.env.AGASSI_MAILINABOX_PASSWORD_FILE).toString ().trim ()
};

console.log ('Setting CNAME...');
const cnameSet = await axios.put (`https://corya.net/admin/dns/custom/${process.env.AGASSI_DOMAIN}/cname`, 'ingress.corya.enterprises', {
    auth
});
console.log (cnameSet.data);
