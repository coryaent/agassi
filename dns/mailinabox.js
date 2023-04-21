"use strict";

const log = require ('./logger.js');

const fs = require ('fs');
const axios = require ('axios');

const auth = {
    username: process.env.AGASSI_MAILINABOX_EMAIL,
    password: fs.readFileSync (process.env.AGASSI_MAILINABOX_PASSWORD_FILE).toString ().trim ()
};

module.exports = {
    putTxtRecord: async function (qname, text) {
        return await axios.put (`https://corya.net/admin/dns/custom/${qname}/txt`, text, {
            auth
        });
    },
    deleteTxtRecord: async function (qname) {
        return await axios.delete (`https://corya.net/admin/dns/custom/${qname}/txt`, {
            auth
        });
    },
    putCnameRecord: async function (qname, target) {
        return await axios.put (`https://corya.net/admin/dns/custom/${qname}/cname`, target, {
            auth
        });
    },
    deleteCnameRecord: async function (qname) {
        return await axios.delete (`https://corya.net/admin/dns/custom/${qname}/cname`, {
            auth
        });
    }
};
