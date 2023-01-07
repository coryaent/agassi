"use strict";

const log = require ('./logger.js');

const fs = require ('fs');
const axios = require ('axios');

const auth = {
    username: process.env.AGASSI_MAILINABOX_EMAIL,
    password: fs.readFileSync (process.env.AGASSI_MAILINABOX_PASSWORD_FILE).toString ().trim ()
};

module.exports = {
    setCnameRecord: async function (domain) {
        return await axios.put (`https://corya.net/admin/dns/custom/${domain}/cname`, process.env.AGASSI_TARGET_CNAME, {
            auth
        });
    },
    deleteCnameRecord: async function domain {
        return await axios.delete (`https://corya.net/admin/dns/custom/${domain}/cname`, {
            auth
        });
    }
};
