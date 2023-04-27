"use strict";

const log = require ('../logger.js');

const dig = require ('node-dig-dns');
const fs = require ('fs');
const axios = require ('axios');
const { getDomain } = require ('tldjs');

function sleep (ms) {
    return new Promise ((resolve) => {
        setTimeout(resolve, ms);
    });
}

const cpanelServer = process.env.AGASSI_CPANEL_SERVER.trim (); // include port
const username = process.env.AGASSI_CPANEL_USERNAME;
const apitoken = fs.readFileSync (process.env.AGASSI_CPANEL_API_TOKEN_FILE).toString ().trim ();
const nameserver = process.env.AGASSI_CPANEL_NAMESERVER;

const auth = {
    headers: {'Authorization': `cpanel ${username}:${apitoken}`}
};

module.exports = {
    // putTxtRecord: async function (qname, text) {
    //     return await axios.put (`https://corya.net/admin/dns/custom/${qname}/txt`, text, {
    //         auth
    //     });
    // },
    //
    // qname -> dname
    // text -> data
    putTxtRecord: async function (dname, data) {

        // parse tld from fqdn
        let tld = getDomain (dname);

        // pause to let serial update
        log.trace ('waiting for serial update to set txt record...');
        await sleep (15000);

        log.trace ('digging serial record...');
        log.trace (await dig ([`@${nameserver}`, tld, 'SOA']));

        // get serial (as string)
        let serial = (await dig ([`@${nameserver}`, tld, 'SOA'])).answer[0].value.split (' ')[2];

        // post get
        return await axios.get (`https://${cpanelServer}/execute/DNS/mass_edit_zone?zone=${tld}&serial=${serial}&add={"dname":"${dname}","ttl":"300","record_type":"TXT","data":["${data}"]}`, auth);

    },
    // putCnameRecord: async function (qname) {
    //     return await axios.put (`https://corya.net/admin/dns/custom/${qname}/cname`, process.env.AGASSI_TARGET_CNAME, {
    //         auth
    //     });
    // },
    // cname -> dname
    putCnameRecord: async function (dname, target) {

        // parse tld from fqdn
        let tld = getDomain (dname);

        // pause to let serial update
        log.trace ('waiting for serial update to set cname record...');
        await sleep (15000);

        // get serial (as string)
        let serial = (await dig ([`@${nameserver}`, tld, 'SOA'])).answer[0].value.split (' ')[2];

        // post get and set cname record
        return await axios.get (`https://${cpanelServer}/execute/DNS/mass_edit_zone?zone=${tld}&serial=${serial}&add={"dname":"${dname}","ttl":"300","record_type":"CNAME","data":["${target}"]}`, auth);

    }
};
