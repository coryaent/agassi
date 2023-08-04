"use strict";

const log = require ('./logger');

const fs = require ('fs');
const dns = require ('node:dns').promises;
const axios = require ('axios');
const parseDomain = require ('tld-extract');

const apiToken = fs.readFileSync (process.env.AGASSI_CPANEL_API_TOKEN_FILE).toString ().trim ();
const cPanelServer = process.env.AGASSI_CPANEL_SERVER.trim ();
const username = process.env.AGASSI_CPANEL_USERNAME.trim ();
const ttl = Math.round(process.env.AGASSI_DNS_TTL);

const auth = {
    headers: {'Authorization': `cpanel ${username}:${apiToken}`}
};

module.exports = {
    putCnameRecord,
    putTxtRecord
};

// string, string, int, string
// '_record' is the argument, 'record' is one of many records
async function putRecord (_fqdn, _type, _record) {
    // make arguments consistent and fit with domain parser
    let fqdn = parseDomain (`https://${_fqdn}`);
    let type = _type.toUpperCase();

    let records = (await axios.get (`https://${cPanelServer}/execute/DNS/parse_zone?zone=${fqdn.domain}`, auth)).data.data;
    let serial = Buffer.from (records.find (record => record.record_type=='SOA').data_b64[2], 'base64').toString ();

    let dname = fqdn.sub; // for consistency with the cPanel API
    let b64Subdomain = Buffer.from (dname).toString ('base64');
    let recordB64Array = [Buffer.from (_record).toString ('base64')];

    let existingRecord = records.find (function findRecord (record) {
        if (record.type == 'record' &&
            record.record_type == type &&
            b64Subdomain == record.dname_b64 &&
            recordB64Array.toString () == record.data_b64.toString ()) {
            return record;
        }
    });

    if (existingRecord) {
        log.debug (`${type} already set`);
        log.debug ('checking ttl');
        // if ttl doesn't match, update record
        if (existingRecord.ttl != ttl) {
            log.debug ('ttl does not match');
            log.debug ('updating record');
            let edit = await axios.get (`https://${cPanelServer}/execute/DNS/mass_edit_zone?zone=${fqdn.domain}&serial=${serial}&edit={"line_index":"${existingRecord.line_index}","dname":"${dname}","ttl":"${ttl}","record_type":"${type}","data":["${_record}"]}`, auth);
            edit = edit.data;
            if (edit.errors) {
                throw new Error (edit.errors.toString ());
            } else {
                if (edit.warnings) {
                    log.warn ('warning:', edit.warnings.toString ());
                } else {
                    log.debug (`${type} ttl updated`);
                }
            }
        } else {
            log.debug ('nothing to do');
        }
    } else {
        log.debug (`setting ${type} record`);
        let addition = await axios.get (`https://${cPanelServer}/execute/DNS/mass_edit_zone?zone=${fqdn.domain}&serial=${serial}&add={"dname":"${dname}","ttl":"${ttl}","record_type":"${type}","data":["${_record}"]}`, auth);
        addition = addition.data;
        if (addition.errors) {
            throw new Error (addition.errors.toString ());
        } else {
            if (addition.warnings) {
                log.warn ('warning:', addition.warnings.toString ());
            } else {
                log.debug (`${type} record set`);
            }
        }
    }
    return 0;
}

async function putCnameRecord (fqdn, record) {
    return putRecord (fqdn, 'CNAME', record);
}

async function putTxtRecord (fqdn, record) {
    return putRecord (fqdn, 'TXT', record);
}
