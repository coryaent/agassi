# Agassi
"They call me Andre Agassi, I dominate the server."</br>
—[GoRemy](https://www.youtube.com/watch?v=B97P0e7ejYw)

## Pre-requisites
- Docker swarm
- etcd
- RSA key (for Let's Encrypt account)
```shell
openssl genrsa -out account.key 4096
```
- OpenSSL key/self-signed certificate pair (for SSL server)
```shell
export CERTNAME=reimagined-invention &&\
openssl req \
-newkey rsa:4096 \
-x509 -sha256 \
-days 3650 \
-nodes \
-out ${CERTNAME}.crt \
-keyout ${CERTNAME}.key \
-subj "/CN=example.com" 
```

## env
```shell
ETCD= # comma-seperated etcd hosts (string array) [required]
ACME_KEY= # PEM key for Let's Encrypt Account (file) [required]
DEFAULT_KEY= # SSL key for HTTPS server and Let's Encrypt CSR's (file) [required]
DEFAULT_CRT= # self-signed SSL certificate for HTTPS server (file) [required]
EMAIL= # email to use for Let's Encrypt (file) [required]
ELECTION_DIR= # election directory in etcd2 (string) [default: /leader]
ELECTION_TTL= # TTL for leader elections (integer, seconds) [default: 10]
CHALLENGE_DIR= # etcd2 directory for ACME challenges (string) [default: /challenges]
CERT_DIR= #etcd2 directory for storing Let's Encrypt certs (string) [default: /certs]
VHOST_DIR= # etcd2 directory for virtual hosts (string) [default: /virtual-hosts]
STAGING= # do or do not use staging environment (boolean) [default: false]
RENEW_INTERVAL= # interval to check for expiring certs (integer, hours) [default: 6]
```

## Virtual Hosts
Virtual hosts are stored in etcd and cached in memory with ES6 Maps. etcd entries are also used to create secure contexts for SNI.
```js
VirtualHost {
    auth: /* htpasswd bcrypt */ ,
    cert: /* Let's Encrypt cert */ ,
    options: {
        /* proxy options */
    }
}
```