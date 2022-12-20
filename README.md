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
=======
## Setup

### Pre-requisites
- Docker swarm
- htpasswd
- base64


## Authorization
```sh
htpasswd -n -B -C 12 user | base64 -w 0
```
