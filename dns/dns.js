"use strict";

const log = require ('../logger.js');

// check that cPanel variables and mailinabox variables are not both set
if ((process.env.AGASSI_CPANEL_SERVER || process.env.AGASSI_CPANEL_USERNAME || process.env.AGASSI_CPANEL_API_TOKEN_FILE)
    && (process.env.AGASSI_MAILINABOX_EMAIL || process.env.AGASSI_MAILINABOX_PASSWORD_FILE)) {
    log.fatal ('cPanel and mailinabox environmental variables cannot be simultaneously set');
    process.exit (1);
}

if (process.env.AGASSI_CPANEL_SERVER) {
    module.exports = require ('./cPanel');
}

if (process.env.AGASSI_MAILINABOX_EMAIL) {
    module.exports = require ('./mailinabox.js');
}
