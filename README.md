# Agassi
"They call me Andre Agassi, I dominate the server."</br>
—[GoRemy](https://www.youtube.com/watch?v=B97P0e7ejYw)

## Overview
Agassi is inspered by the setup detailed at [Docker Swarm Rocks](https://dockerswarm.rocks/). When Traefik dropped support for distributed certificate storage, it created a situation all certificates were stored locally on a single machine. This removed redundency from the setup.

[Roo](https://github.com/sfproductlabs/roo) addresses the redundency issue by creating a custom, in-memory, raft-consensus key-value store for certificates and service information. It does not handle basic authentication, and consists of several thousand lines of go.

Agassi leverages the stability and reliability of etcd and consists of a few hundred lines of JavaScript.

## Setup
Agassi uses docker swarm's secret feature to securely store sensitive data. Private keys are not stored in rqlite.

### Pre-requisites
- Docker swarm
- htpasswd
- base64

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
ACME_KEY= # PEM key for Let's Encrypt Account (file) [required]
DEFAULT_KEY= # SSL key for HTTPS server and Let's Encrypt CSR's (file) [required]
DEFAULT_CRT= # self-signed SSL certificate for HTTPS server (file) [required]
EMAIL= # email to use for Let's Encrypt (file) [required]
RENEW_INTERVAL= # interval to check for expiring certs (integer, hours) [default: 6]
REALM= # displays on basic auth prompt (string) [default: Agassi]
```
