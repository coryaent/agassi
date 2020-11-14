# Agassi
"They call me Andre Agassi, I dominate the server."</br>
—[GoRemy](https://www.youtube.com/watch?v=B97P0e7ejYw)

## Overview
Agassi is inspered by the setup detailed at [Docker Swarm Rocks](https://dockerswarm.rocks/). When Traefik dropped support for distributed certificate storage, it created a situation all certificates were stored locally on a single machine. This removed redundency from the setup.

[Roo](https://github.com/sfproductlabs/roo) addresses the redundency issue by creating a custom, in-memory, raft-consensus key-value store for certificates and service information. It does not handle basic authentication, and consists of several thousand lines of go.

Agassi leverages the stability and reliability of etcd and consists of a few hundred lines of JavaScript.

## Setup
Agassi uses docker swarm's secret feature to securely store sensitive data. Private keys are not stored in etcd.

### Pre-requisites
- Docker swarm
- etcd

### docker secrets
- RSA key (for Let's Encrypt account)
```shell
openssl genrsa 4096 | docker secret create agassi-account-key -
```
- OpenSSL key/self-signed certificate pair (for SSL server)
```shell
export CERTNAME=agassi &&\
export DOMAIN=example.com &&\
openssl req \
-newkey rsa:4096 \
-x509 -sha256 \
-days 3650 \
-nodes \
-out /tmp/${CERTNAME}.crt \
-keyout /tmp/${CERTNAME}.key \
-subj "/CN=${DOMAIN}" &&\
docker secret create agassi-default-certificate /tmp/${CERTNAME}.crt &&\
docker secret create agassi-default-key /tmp/${CERTNAME}.key
```

### env
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

## Data
Data is stored persistently in etcd and cached in-memory using ES6 Maps.

### Docker Services
Docker services are stored in a Map such that a docker service ID points to a virtual host domain. This enables the removal of virtual hosts on the removal of docker services. Service ID's are stored in etcd within virtual hosts.

### Certificates
Certificates are stored within etcd, seperately from virtual hosts. This allows the use of etcd's native TTL in correspondence with certificate expiration.

### Virtual Hosts
```js
VirtualHost {
    serviceID: /* docker service ID */ ,
    auth: /* htpasswd bcrypt */ ,
    options: {
        /* proxy options */
    }
}
```
