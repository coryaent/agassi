"use strict";

const log = require ('./logger');

const fs = require ('fs');
const dns = require ('node:dns').promises;
const dig = require ('node-dig-dns');
const axios = require ('axios');
const parseDomain = require ('tld-extract');

const apiToken = fs.readFileSync (process.env.AGASSI_CPANEL_API_TOKEN_FILE).toString ().trim ();
const cPanelServer = process.env.AGASSI_CPANEL_SERVER.trim ();
const username = process.env.AGASSI_CPANEL_USERNAME.trim ();
const ttl = 14400;

const auth = {
    headers: {'Authorization': `cpanel ${username}:${apiToken}`}
};

module.exports = {
    putCnameRecord,
    putTxtRecord
};

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
    log.debug ('b64Subdomain:', b64Subdomain);
    log.debug ('targetB64Array:', targetB64Array);
    let existingRecord = records.find (function findCnameRecord (record) {
        if (record.type == 'record' && 
            record.record_type == 'CNAME' &&
            b64Subdomain == record.dname_b64 && 
            targetB64Array.toString () == record.data_b64.toString ()) {
            return record;
        }
    });
    if (existingRecord) {
        log.debug ('cname already set');
        log.debug ('checking ttl');
        // if ttl doesn't match, update record
        if (existingRecord.ttl != ttl) {
            log.debug ('ttl does not match');
            log.debug ('updating record');
            let edit = await axios.get (`https://${cPanelServer}/execute/DNS/mass_edit_zone?zone=${fqdn.domain}&serial=${serial}&edit={"line_index":"${existingRecord.line_index}","dname":"${dname}","ttl":"${ttl}","record_type":"CNAME","data":["${target}"]}`, auth);
            log.debug ('edit:', edit.data);
            if (edit.errors) {
                throw new Error (edit.errors.toString ());
            } else {
                if (edit.warnings) {
                    log.warn ('warning:', edit.warnings.toString ());
                } else {
                    log.debug ('CNAME ttl updated');
                }
            }
        }
    } else {
        log.debug ('setting cname record');
        let addition = await axios.get (`https://${cPanelServer}/execute/DNS/mass_edit_zone?zone=${fqdn.domain}&serial=${serial}&add={"dname":"${dname}","ttl":"${ttl}","record_type":"CNAME","data":["${target}"]}`, auth);
        log.debug ('addition:', addition.data);
        if (addition.errors) {
            throw new Error (addition.errors.toString ());
        } else {
            if (addition.warnings) {
                log.warn ('warning:', addition.warnings.toString ());
            } else {
                log.debug ('CNAME record set');
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
    log.debug ('dname_b64:', dname_b64);
    log.debug ('text_b64_array:', text_b64_array);
    let existingRecord = records.find (function findTxtRecord (record) {
        if (record.type == 'record' &&
            record.record_type == 'TXT' &&
            dname_b64 == record.dname_b64 &&
            text_b64_array.toString () == record.data_b64.toString ()) {
            return record;
        }
    });
    if (existingRecord) {
        log.debug ('txt already set');
        log.debug ('checking ttl');
        // if ttl doesn't match, update record
        if (existingRecord.ttl != ttl) {
            log.debug ('ttl does not match');
            log.debug ('updating record');
            let edit = await axios.get (`https://${cPanelServer}/execute/DNS/mass_edit_zone?zone=${fqdn.domain}&serial=${serial}&edit={"line_index":"${existingRecord.line_index}","dname":"${dname}","ttl":"${ttl}","record_type":"TXT","data":["${text}"]}`, auth);
            log.debug ('edit:', edit.data);
            if (edit.errors) {
                throw new Error (edit.errors.toString ());
            } else {
                if (edit.warnings) {
                    log.warn ('warning:', edit.warnings.toString ());
                } else {
                    log.debug ('txt ttl updated');
                }
            }
        }
    } else {
        log.debug ('setting txt record');
        let addition = await axios.get (`https://${cPanelServer}/execute/DNS/mass_edit_zone?zone=${fqdn.domain}&serial=${serial}&add={"dname":"${dname}","ttl":"${ttl}","record_type":"TXT","data":["${text}"]}`, auth);
        log.debug ('addition:', addition.data);
        if (addition.errors) {
            throw new Error (addition.errors.toString ());
        } else {
            if (addition.warnings) {
                log.warn ('warning:', addition.warnings.toString ());
            } else {
                log.debug ('txt record set');
            }
        }
    }
    return 0;
}
