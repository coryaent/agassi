"use strict";

const axios = require ('axios');

const isValidDomain = require ('is-valid-domain');
const isValidIP = require ('validate-ip-node');

const auth = {
    username: process.env.AGASSI_MAILINABOX_EMAIL,
    password: fs.readFileSync (process.env.AGASSI_MAILINABOX_PASSWORD_FILE).toString ().trim ()
};

console.log ('Setting CNAME...');
const cnameSet = await axios.put (`https://corya.net/admin/dns/custom/${process.env.AGASSI_DOMAIN}/cname`, 'ingress.corya.enterprises', {
    auth
});
console.log (cnameSet.data);
