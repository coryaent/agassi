# reimagined-invention
A proxy for docker containers, services, and stacks, with Let's Encrypt SSL and etcd-backed redundancy

## Pre-requisites
- Docker swarm
- etcd
- RSA key (for Let's Encrypt account)
```shell
openssl genrsa -out account.key 2048
```
- OpenSSL key/self-signed certificate pair (for SSL server)
```shell
export CERTNAME=reimagined-invention &&\
openssl req \
-newkey rsa:2048\
-x509 -sha256 \
-days 3650 \
-nodes \
-out ${CERTNAME}.crt \
-keyout ${CERTNAME}.key \
-subj "/CN=example.com" 
```

## ENV
```shell
ETCD= # comma-seperated etcd hosts (string array) [required]
ACME_KEY= # PEM key for Let's Encrypt Account (file) [required]
DEFAULT_KEY= # SSL key for default HTTPS server (file) [required]
DEFAULT_CRT= # self-signed SSL certificate for HTTPS (file) [required]
ELECTION_DIR= # election directory in etcd2 (string) [default: /leader]
ELECTION_TTL= # TTL for leader elections (integer, seconds) [default: 10]
CHALLENGE_DIR= # etcd2 directory for ACME challenges (string) [default: /challenges]
VHOST_DIR= # etcd2 directory for virtual hosts (string) [default: /virtual-hosts]
CERTIFICATE_DIR= # etcd2 directory for Let's Encrypt certificates (string) [default: /certificates]
STAGING= # do or do not use staging environment (boolean) [default: false]
```