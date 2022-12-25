"use strict";

const log = require ('./logger.js');

const axios = require ('axios');

const isValidDomain = require ('is-valid-domain');
const isValidIP = require ('validate-ip-node');

if (process.env.AGASSI_TARGET_ALIAS && process.env.AGASSI_TARGET_CNAME) {
    log.error ('AGASSI_TARGET_ALIAS and AGASSI_TARGET_CNAME cannot both be set');
    process.exit (1);
}

const auth = {
    username: process.env.AGASSI_MAILINABOX_EMAIL,
    password: fs.readFileSync (process.env.AGASSI_MAILINABOX_PASSWORD_FILE).toString ().trim ()
};

module.exports = async function (domain) {
    return await axios.put (`https://corya.net/admin/dns/custom/${domain}/cname`, process.env.AGASSI_TARGET_CNAME, {
        auth
    });
};
