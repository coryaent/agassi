# reimagined-invention
A proxy for docker containers, services, and stacks, with Let's Encrypt SSL and etcd-backed redundancy

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
-newkey rsa:4096\
-x509 -sha256 \
-days 3650 \
-nodes \
-out ${CERTNAME}.crt \
-keyout ${CERTNAME}.key \
-subj "/CN=example.com" 
```

## ENV
```shell
ETCD=host01,host02,host03 # comma-seperated etcd hosts
ELECTION_TTL= # TTL for leader elections (integer, seconds)
ACME_KEY= # RSA key for Let's Encrypt Account (file)
DEFAULT_KEY= # SSL key for default HTTPS server (file)
DEFAULT_CRT= # self-signed SSL certificate for HTTPS (file)
```