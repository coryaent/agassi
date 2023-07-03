"use strict";

import { createRequire } from "module";
const require = createRequire (import.meta.url);

const fs = require ('fs');
const dns = require ('node:dns').promises;
const dig = require ('node-dig-dns');
const axios = require ('axios');
const parseDomain = require ('tld-extract');

const apitoken = fs.readFileSync ('./cpanel-api-key.txt').toString ().trim ();
const cPanelServer = 'cpanel.corya.net';
const domain = 'corya.co';
const username = 'coryane1';
const ttl = 14400;

const auth = {
    headers: {'Authorization': `cpanel ${username}:${apitoken}`}
};

console.log ('API token:', apitoken);

(async () => {
    // await debug ();
    await putCnameRecord ('whoami2.staging.corya.co', 'staging.corya.enterprises');
    await putTxtRecord ('_myrecord.staging.corya.co', 'mytextvalue');
    /*
        from https://api.docs.cpanel.net/openapi/cpanel/operation/dns-parse_zone/
        Important: Most DNS zones contain only 7-bit ASCII. However, it is possible for DNS zones 
            to contain any binary sequence. An application that decodes this function's base64 
            output must be able to handle cases where the decoded 
            octets do not match any specific character encoding.
        therefore we must encode our domains passed to our functions
        ex. let base64Out = Buffer ('our string').toString ('base64');
    */
    /*
        parseDomain takes 'https://subdomain.example.com' and returns
        {
            tld: 'com',
            domain: 'example.com',
            sub: 'subdomain'
        }
        note that the protocol is required
    */

    /*
        we need functions to:
            [x] put a cname domain (if one does not exist)
            put a txt record (if one does not exist, otherwise overwrite)
    */

    /*
        we have functions to: (see https://api.docs.cpanel.net/openapi/cpanel/operation/dns-mass_edit_zone/)
            add an entry, requires:
                serial
                zone ('domain' from parseDomain)
                dname ('sub' from parseDomain)
                ttl
                record_type
                data (an array of strings (i.e. [target]))
            edit an entry, requires:
                serial
                zone
                line_index
                dname
                ttl
                record_type
                data
            remove an entry, requires:
                an array of line indexes to remove
    */



}) ();

async function putCnameRecord (_fqdn, _target) {
    let fqdn = parseDomain (`https://${_fqdn}`);
    let dname = fqdn.sub;

    let records = (await axios.get (`https://${cPanelServer}/execute/DNS/parse_zone?zone=${fqdn.domain}`, auth)).data.data;
    let serial = Buffer.from (records.find (record => record.record_type=='SOA').data_b64[2], 'base64').toString ();
    let target = _target;
    if (!_target.endsWith ('.')) {
        target = _target + '.';
    }

    let b64Subdomain = Buffer.from (dname).toString ('base64');
    let targetB64Array = [Buffer.from (target).toString ('base64')];
    console.log ('b64Subdomain:', b64Subdomain);
    console.log ('targetB64Array:', targetB64Array);
    let existingRecord = records.find (function findCnameRecord (record) {
        if (record.type == 'record' && 
            record.record_type == 'CNAME' &&
            b64Subdomain == record.dname_b64 && 
            targetB64Array.toString () == record.data_b64.toString ()) {
            return record;
        }
    });
    if (existingRecord) {
        console.log ('cname already set');
        console.log ('checking ttl');
        console.log ('matching cname record:', existingRecord);
        // if ttl doesn't match, update record
        if (existingRecord.ttl != ttl) {
            console.log ('ttl does not match');
            console.log ('updating record');
            let edit = await axios.get (`https://${cPanelServer}/execute/DNS/mass_edit_zone?zone=${fqdn.domain}&serial=${serial}&edit={"line_index":"${existingRecord.line_index}","dname":"${dname}","ttl":"${ttl}","record_type":"CNAME","data":["${target}"]}`, auth);
            console.log ('edit:', edit.data);
            if (edit.errors) {
                throw new Error (edit.errors.toString ());
            } else {
                if (edit.warnings) {
                    console.log ('warning:', edit.warnings.toString ());
                } else {
                    console.log ('CNAME ttl updated');
                }
            }
        }
    } else {
        console.log ('setting cname record');
        let addition = await axios.get (`https://${cPanelServer}/execute/DNS/mass_edit_zone?zone=${fqdn.domain}&serial=${serial}&add={"dname":"${dname}","ttl":"${ttl}","record_type":"CNAME","data":["${target}"]}`, auth);
        console.log ('addition:', addition.data);
        if (addition.errors) {
            throw new Error (addition.errors.toString ());
        } else {
            if (addition.warnings) {
                console.log ('warning:', addition.warnings.toString ());
            } else {
                console.log ('CNAME record set');
            }
        }
    }
    return 0;
}

async function putTxtRecord (_fqdn, text) {
    let fqdn = parseDomain (`https://${_fqdn}`);
    let dname = fqdn.sub;

    let records = (await axios.get (`https://${cPanelServer}/execute/DNS/parse_zone?zone=${fqdn.domain}`, auth)).data.data;
    let serial = Buffer.from (records.find (record => record.record_type=='SOA').data_b64[2], 'base64').toString ();

    let dname_b64 = Buffer.from (dname).toString ('base64');
    let text_b64_array = [Buffer.from (text).toString ('base64')];
    console.log ('dname_b64:', dname_b64);
    console.log ('text_b64_array:', text_b64_array);
    let existingRecord = records.find (function findTxtRecord (record) {
        if (record.type == 'record' &&
            record.record_type == 'TXT' &&
            dname_b64 == record.dname_b64 &&
            text_b64_array.toString () == record.data_b64.toString ()) {
            return record;
        }
    });
    if (existingRecord) {
        console.log ('txt already set');
        console.log ('checking ttl');
        console.log ('matching txt record:', existingRecord);
        // if ttl doesn't match, update record
        if (existingRecord.ttl != ttl) {
            console.log ('ttl does not match');
            console.log ('updating record');
            let edit = await axios.get (`https://${cPanelServer}/execute/DNS/mass_edit_zone?zone=${fqdn.domain}&serial=${serial}&edit={"line_index":"${existingRecord.line_index}","dname":"${dname}","ttl":"${ttl}","record_type":"TXT","data":["${text}"]}`, auth);
            console.log ('edit:', edit.data);
            if (edit.errors) {
                throw new Error (edit.errors.toString ());
            } else {
                if (edit.warnings) {
                    console.log ('warning:', edit.warnings.toString ());
                } else {
                    console.log ('txt ttl updated');
                }
            }
        }
        
    } else {
        console.log ('setting txt record');
        let addition = await axios.get (`https://${cPanelServer}/execute/DNS/mass_edit_zone?zone=${fqdn.domain}&serial=${serial}&add={"dname":"${dname}","ttl":"${ttl}","record_type":"TXT","data":["${text}"]}`, auth);
        console.log ('addition:', addition.data);
        if (addition.errors) {
            throw new Error (addition.errors.toString ());
        } else {
            if (addition.warnings) {
                console.log ('warning:', addition.warnings.toString ());
            } else {
                console.log ('txt record set');
            }
        }
    }
    return 0;
}

async function debug () {
    // compare serial numbers
    let jsSerial = (await dns.resolveSoa (domain)).serial;
    console.log ('JS serial:', jsSerial);

    let digSerial = (await dig ([domain, 'SOA'])).answer[0].value.split (' ')[2];
    console.log ('DIG serial:', digSerial);

    // get all zone records for domain
    let records = (await axios.get (`https://${cPanelServer}/execute/DNS/parse_zone?zone=${domain}`, auth)).data.data;
    let apiSerial = Buffer.from (records.find (record => record.record_type=='SOA').data_b64[2], 'base64').toString ();
    console.log ('API serial:', apiSerial);

    let decodedRecords = [];
    for (let record of records) {
        if (record.type === 'record' && record.record_type === 'TXT') {
            console.log (record);
            let data = [Buffer.from (record.data_b64.toString(), 'base64').toString()];
//            console.log ('data:', data);
            let dname = Buffer.from (record.dname_b64, 'base64').toString ();
//            console.log ('dname:', dname);
        }
    }
}
