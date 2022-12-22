# Agassi
Agassi is inspired by the setup detailed at [Docker Swarm Rocks](https://dockerswarm.rocks/). When Traefik dropped support for distributed certificate storage, it created a situation all certificates were stored locally on a single machine. This removed redundency from the setup.

By taking advantage of Docker Swarm's built-in state management, Agassi is able to run entirely in memory without the use of generative templates.

## Configuration
```
AGASSI_DOCKER_API_VERSION defaults v1.37
AGASSI_DOCKER_HOST
AGASSI_DOCKER_PORT
AGASSI_LETS_ENCRYPT_EMAIL
AGASSI_MAILINABOX_EMAIL
AGASSI_MAILINABOX_PASSWORD_FILE
AGASSI_REDIS_HOST
AGASSI_REDIS_PORT
AGASSI_TARGET_ALIAS
AGASSI_TARGET_CNAME
```
## Redis
- We need to get the cert from the domain for SNI
- We need to get the options from the domain for proxy handling
- We need to get the domain from the hash W
- We need to get virtual hosts by hash.

`SET cert:example.com [cert] EX [cert expiration]`

`HSET service:[service id] [vhost] [auth] [options]`

`SET auth:example.com [auth]`

`SET opts:example.com [options]`

## Flow
Agassi requires the use of two seperate services, a client (ACME and Docker) and a server (HTTPS).
### Client
Client spins up.

Client checks for existing services and makes sure certificates are current.

Client subscribes to new service updates.

Server spins up
## Authorization
```sh
htpasswd -n -B -C 12 user | base64 -w 0
```
