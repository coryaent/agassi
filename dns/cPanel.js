"use strict";

const dig = require ('node-dig-dns');
const log = require ('./logger.js');
const fs = require ('fs');
const axios = require ('axios');
const { getDomain } = require ('tldjs');

const cpanelServer = process.env.AGASSI_CPANEL_SERVER; // include port
const username = process.env.AGASSI_CPANEL_USERNAME;
const apitoken = fs.readFileSync (process.env.AGASSI_CPANEL_APITOKEN_FILE).toString ().trim ()

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

    },
    // get serial (as string)
    let serial = (await dig ([tld, 'SOA'])).answer[0].value.split (' ')[2];
    let tld = getDomain (dname);;

    // post get
    let got = await axios.get (`https://${cpanelServer}/execute/DNS/mass_edit_zone?zone=${tld}&serial=${serial}&add={"dname":"${dname}","ttl":"300","record_type":"TXT","data":["${data}"]}`, auth);
    serial = got.data.data.new_serial;
    // got response .data
    // check got for error and throw

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
    putCnameRecord: async function (dname, ) {

    }

    // deleteCnameRecord: async function (qname) {
    //     return await axios.delete (`https://corya.net/admin/dns/custom/${qname}/cname`, {
    //         auth
    //     });
    // }
};
