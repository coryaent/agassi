# Agassi
Agassi is inspired by the setup detailed at [Docker Swarm Rocks](https://dockerswarm.rocks/). When Traefik dropped support for distributed certificate storage, it created a situation all certificates were stored locally on a single machine. This removed redundency from the setup.

By taking advantage of Docker Swarm's built-in state management, Agassi is able to run entirely in memory without the use of generative templates.

## Configuration

ENVAR | Detail | Default
--- | --- | ---
`AGASSI_ACME_PRODUCTION` | if set to any value, fetch certificates from production Let's Encrypt |
`AGASSI_AUTH_REALM` | the realm to use from basic authentication | 'Agassi'
`AGASSI_DEFAULT_KEY_FILE` | the path to the default key used for signing certificates |
`AGASSI_DOCKER_API_VERSION` | passed to [dockerode](https://github.com/apocas/dockerode) | 'v1.37'
`AGASSI_DOCKER_HOST` | TCP socket passed to dockerode |
`AGASSI_DOCKER_PORT` | TCP port passed to dockerode | 2375
`AGASSI_LETS_ENCRYPT_EMAIL` | email address used to send certificate renewal notifications |
`AGASSI_LOG_LEVEL` | trace, debug, info, warn, error, fatal | 'info'
`AGASSI_MAILINABOX_EMAIL` | email used to authenticate mail-in-a-box API |
`AGASSI_MAILINABOX_PASSWORD_FILE` | path to the password file used to authenticate mail-in-a-box API |
`AGASSI_REDIS_HOST` | redis endpoint |
`AGASSI_REDIS_PORT` | port used to connect to redis | 6379
`AGASSI_TARGET_CNAME` | cname value to which DNS records point |

## Redis
*HSET should be SET with EX argument*
`HSET cert:example.com [cert] [cert expiration]`

`SET service:[service id] [vhost]`

`HSET vhost:example.com [auth] [options]`

## Labels

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
