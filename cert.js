"use strict";
import { createRequire } from "module";
const require = createRequire (import.meta.url);
// generates a default cert key pair for https server defaults

const forge = require ('node-forge');
const fs = require ('fs');
const os = require ('os');

const rsa = forge.pki.rsa;

generateDefaultCert ();

function generateDefaultCert () {
    //const privateKey = forge.pki.privateKeyFromPem (fs.readFileSync (process.env.AGASSI_DEFAULT_KEY_FILE));
    console.log ('generating keypair...');
    let keypair = rsa.generateKeyPair({bits: 4096, e: 0x10001});
    let pemPrivateKey = forge.pki.privateKeyToPem (keypair.privateKey);
    console.log (pemPrivateKey);
    let privateKey = keypair.privateKey;
    //console.log ('created private key');
    //const publicKey = forge.pki.setRsaPublicKey (privateKey.n, privateKey.e);
    let publicKey = keypair.publicKey;
    //console.log ('created public key'); // I think
    const cert = forge.pki.createCertificate ();
    cert.publicKey = publicKey;
    cert.validity.notBefore = new Date ();
    cert.validity.notAfter = new Date ();
    cert.validity.notAfter.setFullYear (cert.validity.notBefore.getFullYear() + 128);
    cert.setSubject ([{
        name: 'commonName',
        value: `${os.hostname ()}.invalid`
    }]);
    //console.log ('created cert');
    cert.sign (privateKey, forge.md.sha256.create ());
    //console.log ('signed cert');
    let certPem = forge.pki.certificateToPem (cert);
    console.log (certPem);
    let certPemBuffer =  Buffer.from (forge.pki.certificateToPem (cert));
    //console.log (certPem);

   const certFromPem = forge.pki.certificateFromPem (certPem);
   //console.log ('cert from pem:', certFromPem);
   console.log ('cert years until expiration:', (new Date (certFromPem.validity.notAfter).getTime () - new Date ().getTime ())/(1000*60*60*24*365));

    // return {privateKey: privateKeyPem, cert: certPem}
}
