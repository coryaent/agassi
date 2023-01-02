# Agassi
Agassi is inspired by the setup detailed at [Docker Swarm Rocks](https://dockerswarm.rocks/). When Traefik dropped support for distributed certificate storage, it created a situation all certificates were stored locally on a single machine. This removed redundency from the setup.

By taking advantage of Docker Swarm's built-in state management, Agassi is able to run entirely in memory without the use of generative templates.

## Configuration
```
AGASSI_ACME_PRODUCTION
AGASSI_DEFAULT_KEY_FILE
AGASSI_DOCKER_API_VERSION default -> v1.37
AGASSI_DOCKER_HOST
AGASSI_DOCKER_PORT
AGASSI_LETS_ENCRYPT_EMAIL
AGASSI_LOG_LEVEL default -> info
AGASSI_MAILINABOX_EMAIL
AGASSI_MAILINABOX_PASSWORD_FILE
AGASSI_REDIS_HOST
AGASSI_REDIS_PORT
AGASSI_TARGET_ALIAS
AGASSI_TARGET_CNAME
```
## Redis

`HSET cert:example.com [cert] [cert expiration]`

`SET service:[service id] [vhost]`

`HSET vhost:example.com [auth] [options]`

## Flow
Agassi requires the use of two seperate services, a client (ACME and Docker) and a server (HTTPS).
### Client
Client spins up.

Client checks for existing services and makes sure certificates are current.

Client subscribes to new service updates.

### Server
Server spins up.

Starts listening to HTTPS requests.

## Authorization
```sh
htpasswd -n -B -C 12 user | base64 -w 0
```
```sh
openssl genrsa 4096 | docker secret create agassi_default_key -
```
