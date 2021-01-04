"use strict";

const fs = require ('fs');
const ssl = require ('ssl-utils');
const isEmail = require ('is-email');
const isUrl = require ('is-url');

// shared configuration object
const Config = {};

class ConfigError extends Error {
    constructor (message) {
      super (message);
      this.name = 'ConfigError';
    }
}

/*-------------------\
| required variables |
\-------------------*/
const requiredVariables = [
    'ACME_DIRECTORY_URL',
    'ACME_KEY_FILE',
    'ACME_EMAIL_FILE',
    'DEFAULT_CERT_FILE',
    'DEFAULT_KEY_FILE',
    'DOCKER_SOCKET_URL'
];

requiredVariables.forEach ((variable) => {
    if (!process.env[variable]) {
        throw new ConfigError (`Environmental variable ${variable} is required.`);
    }
    if (variable.endsWith ('FILE')) {
        try {
            fs.readFileSync (process.env[variable], 'utf-8');
        } catch {
            throw new ConfigError (`Error reading file at ${process.env[variable]}.`);
        }
    }
});

Config.acmeDirectory = process.env.ACME_DIRECTORY_URL;
Config.acmeKey = fs.readFileSync (process.env.ACME_KEY_FILE, 'utf-8');
Config.acmeEmail = ((fs.readFileSync (process.env.ACME_EMAIL_FILE, 'utf-8')).trim()).startsWith('mailto:') ?
/* acmeEmail is pre-     */ (fs.readFileSync (process.env.ACME_EMAIL_FILE, 'utf-8')).trim() :
/* pended with 'mailto:' */ 'mailto:' + (fs.readFileSync (process.env.ACME_EMAIL_FILE, 'utf-8')).trim();

Config.defaultCert = fs.readFileSync (process.env.DEFAULT_CERT_FILE, 'utf-8');
Config.defaultKey = fs.readFileSync (process.env.DEFAULT_KEY_FILE, 'utf-8');

Config.dockerSocket = process.env.DOCKER_SOCKET_URL;

/*-------------------\
|      validate      |
\-------------------*/
if (!isUrl (Config.acmeDirectory)) {
    throw new ConfigError (`${Config.acmeDirectory} does not appear to be a valid URL.`);
}
ssl.verifyKey (Config.acmeKey, {}, function checkAcmeKey (error, result) {
    if (error) {
        throw new ConfigError (`Could not validate ACME key or the key is not valid.`);
    }
    if (!result.keyStatus.valid) {
        throw new ConfigError (`ACME key does not appear to be valid.`);
    }
});
if (!isEmail (Config.acmeEmail.replace ('mailto:', ''))) {
    throw new ConfigError (`${Config.acmeEmail} does not appear to be a valid email.`);
}
ssl.verifyCertificateKey (Config.defaultCert, Config.defaultKey, {}, function checkDefaultPair (error, result) {
    if (error) {
        throw new ConfigError (`Could not validate default cert-key pair.`);
    }
    if (!result.certStatus.valid) {
        throw new ConfigError (`Default certificate does not appear to be valid.`);
    }
    if (!result.keyStatus.valid) {
        throw new ConfigError (`Default key does not appear to be valid.`);
    }
    if (!result.match) {
        throw new ConfigError (`Default certificate does not match default key.`);
    }
});
if (!isUrl (Config.dockerSocket)) {
    throw new ConfigError (`${Config.dockerSocket} does not appear to be a valid URL.`);
}

/*-------------------\
| optional variables |
\-------------------*/
Config.clusterKey = process.env.CLUSTER_KEY_FILE ? fs.readFileSync (process.env.CLUSTER_KEY_FILE, 'utf-8') : null;
Config.labelPrefix = process.env.LABEL_PREFIX ? process.env.LABEL_PREFIX : 'agassi.';
Config.realm = process.env.REALM ? process.env.REALM : 'Agassi';

module.exports = Config;