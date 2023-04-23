"use strict";

const log = require ('../logger.js');

const dig = require ('node-dig-dns');
const fs = require ('fs');
const axios = require ('axios');
const { getDomain } = require ('tldjs');

const cpanelServer = process.env.AGASSI_CPANEL_SERVER.trim (); // include port
const username = process.env.AGASSI_CPANEL_USERNAME;
const apitoken = fs.readFileSync (process.env.AGASSI_CPANEL_API_TOKEN_FILE).toString ().trim ()

const auth = {
    headers: {'Authorization': `cpanel ${username}:${apitoken}`}
};

// this is a variable that is set once by dig and subsequently on response data
// it does not need to be accessed outside of this module
var serial;

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
        let tld = getDomain (dname);;

        // get serial (as string)
        if (!serial) {
            serial = (await dig ([tld, 'SOA'])).answer[0].value.split (' ')[2];
        }

        // post get
        let got = await axios.get (`https://${cpanelServer}/execute/DNS/mass_edit_zone?zone=${tld}&serial=${serial}&add={"dname":"${dname}","ttl":"300","record_type":"TXT","data":["${data}"]}`, auth);
        serial = got.data.data.new_serial;

        // deleteTxtRecord: async function (qname) {
        //     return await axios.delete (`https://corya.net/admin/dns/custom/${qname}/txt`, {
        //         auth
        //     });
        // },

        // TODO remove calls to this function

        // putCnameRecord: async function (qname) {
        //     return await axios.put (`https://corya.net/admin/dns/custom/${qname}/cname`, process.env.AGASSI_TARGET_CNAME, {
        //         auth
        //     });
        // },
        // cname -> dname
    },
    putCnameRecord: async function (dname, target) {

        // parse tld from fqdn
        let tld = getDomain (dname);

        // get serial (as string)
        if (!serial) {
            serial = (await dig ([tld, 'SOA'])).answer[0].value.split (' ')[2];
        }

        // post get and set cname record
        let got = await axios.get (`https://cpanel.corya.net:2083/execute/DNS/mass_edit_zone?zone=${tld}&serial=${serial}&add={"dname":"${dname}","ttl":"300","record_type":"CNAME","data":["${target}"]}`, auth);
        serial = got.data.data.new_serial;

    }

    // deleteCnameRecord: async function (qname) {
    //     return await axios.delete (`https://corya.net/admin/dns/custom/${qname}/cname`, {
    //         auth
    //     });
    // }
};
