# reimagined-invention
A proxy for docker containers, services, and stacks, with Let's Encrypt SSL and etcd-backed redundancy

## Pre-requisites
- Docker swarm
- etcd
- RSA key (for Let's Encrypt account)
```
openssl genrsa -out domain.key 4096
```
- OpenSSL key/self-signed certificate pair (for SSL server)
```
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
```
ETCD=host01,host02,host03
ELECTION_TTL=
ACME_KEY=

DEFAULT_CRT=
```