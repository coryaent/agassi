"use strict";
const log = require ('./logger.js');
const axios = require ('axios');

(async () => {
    log.debug ((await axios.get ('https://fiber12.dnsiaas.com:2083/execute/DNS/parse_zone?zone=corya.net', {headers: {'Authorization': 'cpanel coryane1:DKYVPFOCN06F9U82KCEYJWTU4SJKLVSM'}})).data.data);
}) ();
