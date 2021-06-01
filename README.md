# Agassi
"They call me Andre Agassi, I dominate the server."</br>
—[GoRemy](https://www.youtube.com/watch?v=B97P0e7ejYw)

## Overview
Agassi is inspired by the setup detailed at [Docker Swarm Rocks](https://dockerswarm.rocks/). When Traefik dropped support for distributed certificate storage, it created a situation all certificates were stored locally on a single machine. This removed redundency from the setup.

By taking advantage of Docker Swarm's built-in state management, Agassi is able to run entirely in memory without the use of generative templates.

## Before You Begin
Agassi uses docker swarm's secret feature to securely store sensitive data. You will need two RSA keys, one of which is the key to access your ACME account, and the other of which is used for certificate signing requests (for both ACME certificates and self-signed certificates.) Agassi will create a new, self-signed certificate each time it starts.

Secrets can be created with openssl:
```
openssl genrsa 4096 | docker secret create acme.key
```
```
openssl genrsa 4096 | docker secret create agassi.key
```

## Configuration
The Agassi service can be run with several options, set with either command arguments or environment variables. Command arguments take precedent over environmental variables. Configuration options with default values are required.

| CMD               | ENV               | Default                   | Description                                               |
| :-:               | :-:               | :-:                       | :-                                                        |
| `-p`, `--persist` | `PERSIST`         | --                        | Directory to persist certificates, defaults to in-memory  |
| `-e`, `--email`   | `ACCOUNT_EMAIL`   | --                        | Email for certificate status updates                      |
| `--account-key`   | `ACCOUNT_KEY`     | `/run/secrets/acme.key`   | Path to RSA key used to login to your ACME account        |
| `--default-key`   | `DEFAULT_KEY`     | `/run/secrets/agassi.key` | Path to RSA key used to sign your CSR's                   |
=======
## Setup
Agassi uses docker swarm's secret feature to securely store sensitive data. Private keys are not stored in rqlite.

### Pre-requisites
- Docker swarm
- htpasswd
- base64
