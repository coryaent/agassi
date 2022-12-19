# Agassi
Agassi is inspired by the setup detailed at [Docker Swarm Rocks](https://dockerswarm.rocks/). When Traefik dropped support for distributed certificate storage, it created a situation all certificates were stored locally on a single machine. This removed redundency from the setup.

By taking advantage of Docker Swarm's built-in state management, Agassi is able to run entirely in memory without the use of generative templates.

## Configuration
```
ENV AGASSI_REDIS_HOST
ENV AGASSI_REDIS_PORT
ENV AGASSI_DOCKER_HOST
ENV AGASSI_DOCKER_PORT
```
=======
## Setup

### Pre-requisites
- Docker swarm
- htpasswd
- base64
