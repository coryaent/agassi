"use strict";

const log = require ('../logger.js');

const dig = require ('node-dig-dns');
const fs = require ('fs');
const axios = require ('axios');
const parseDomain = require ('tld-extract');

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
        let domain = parseDomain (`https://${dname}`);
        log.trace (`setting txt record for ${dname} on domain ${domain.domain}`);

        // pause to let serial update
        log.trace ('waiting for serial update to set txt record...');
        await sleep (30000);

        log.trace ('digging serial record...');
        // get serial (as string)
        let serial = (await dig ([`@${nameserver}`, domain.domain, 'SOA'])).answer[0].value.split (' ')[2];

        // post get
        return await axios.get (`https://${cpanelServer}/execute/DNS/mass_edit_zone?zone=${domain.domain}&serial=${serial}&add={"dname":"${domain.sub}","ttl":"300","record_type":"TXT","data":["${data}"]}`, auth);

    },
    // putCnameRecord: async function (qname) {
    //     return await axios.put (`https://corya.net/admin/dns/custom/${qname}/cname`, process.env.AGASSI_TARGET_CNAME, {
    //         auth
    //     });
    // },
    // cname -> dname
    putCnameRecord: async function (dname, target) {

        // parse tld from fqdn
        let domain = parseDomain (`https://${dname}`);
        log.trace (`setting cname record for ${dname} on domain ${domain.domain}`);

        // pause to let serial update
        log.trace ('waiting for serial update to set cname record...');
        await sleep (30000);

        // get serial (as string)
        let serial = (await dig ([`@${nameserver}`, domain.domain, 'SOA'])).answer[0].value.split (' ')[2];

        // post get and set cname record
        return await axios.get (`https://${cpanelServer}/execute/DNS/mass_edit_zone?zone=${domain.domain}&serial=${serial}&add={"dname":"${domain.sub}","ttl":"300","record_type":"CNAME","data":["${target}"]}`, auth);

    }
};
