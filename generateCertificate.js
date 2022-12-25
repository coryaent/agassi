"use strict";

// generates a default cert key pair for https server defaults

const forge = require ('node-forge');
const fs = require ('fs');
const os = require ('os');

const log = require ('./logger.js');

module.exports = function generateDefaultCert () {
    const privateKey = forge.pki.privateKeyFromPem (fs.readFileSync (process.env.AGASSI_DEFAULT_KEY_FILE));
    log.debug ('read private key');
    const publicKey = forge.pki.setRsaPublicKey (privateKey.n, privateKey.e);
    log.debug ('created public key'); // I think
    const cert = forge.pki.createCertificate ();
    cert.publicKey = publicKey;
    cert.validity.notBefore = new Date ();
    cert.validity.notAfter = new Date ();
    cert.validity.notAfter.setFullYear (cert.validity.notBefore.getFullYear() + 128);
    cert.setSubject ([{
        name: 'commonName',
        value: `${os.hostname ()}.invalid`
    }]);
    log.debug ('created cert');
    cert.sign (privateKey, forge.md.sha256.create ());
    log.debug ('signed cert');
    return Buffer.from (forge.pki.certificateToPem (cert));
}
