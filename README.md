![CodeFactor Grade](https://img.shields.io/codefactor/grade/github/coryaent/agassi?style=flat-square)

# Agassi
Agassi is inspired by the setup detailed at [Docker Swarm Rocks](https://dockerswarm.rocks/). When Traefik dropped support for distributed certificate storage, it created a situation all certificates were stored locally on a single machine. This removed redundency from the setup.

By taking advantage of Docker Swarm's built-in state management, Agassi is able to run entirely in memory without the use of generative templates. Domain and virtual host are used interchangably in the code.

# TODO
[ ] handle case where two services have the same vhost/domain

## Configuration

ENVAR | Detail | Default
--- | --- | ---
`AGASSI_ACME_PRODUCTION` | if set to any value, fetch certificates from production Let's Encrypt |
`AGASSI_ACME_ACCOUNT_KEY_FILE` | the path to the key to the ACME account |
`AGASSI_AUTH_REALM` | the realm to use from basic authentication | 'Agassi'
`AGASSI_DEFAULT_KEY_FILE` | the path to the default key used for signing certificates |
`AGASSI_DOCKER_API_VERSION` | passed to [dockerode](https://github.com/apocas/dockerode) | 'v1.37'
`AGASSI_DOCKER_HOST` | TCP socket passed to dockerode |
`AGASSI_DOCKER_PORT` | TCP port passed to dockerode | 2375
`AGASSI_EXPIRATION_THRESHOLD` | days before certificate expires to renew | '45'
`AGASSI_LABEL_PREFIX` | label prefix to define virtual hosts | 'page.agassi.'
`AGASSI_LETS_ENCRYPT_EMAIL` | email address used to send certificate renewal notifications |
`AGASSI_LOG_LEVEL` | trace, debug, info, warn, error, fatal | 'info'
`AGASSI_MAILINABOX_EMAIL` | email used to authenticate mail-in-a-box API |
`AGASSI_MAILINABOX_PASSWORD_FILE` | path to the password file used to authenticate mail-in-a-box API |
`AGASSI_MAINTENANCE_INTERVAL` | how often to prune services and update certificates (minutes) | '60'
`AGASSI_REDIS_HOST` | redis endpoint |
`AGASSI_REDIS_PORT` | port used to connect to redis | 6379
`AGASSI_TARGET_CNAME` | cname value to which DNS records point |

## Redis
`SET cert:example.com [cert] PX [ms until expiration]`

`SET service:[service id] [vhost]`

`HSET vhost:example.com [auth] [options]`

## Labels
- `page.agassi.vhost` set to your target domain `example.com`
- `page.agassi.auth` see Authorization for how to generate an auth string
- `page.agassi.opts.target` the service access address for example `http://myservice:80`
All options prefixed with `page.agassi.opts.` are camel-cased (set `prependPath` with the label `page.agassi.opts.prepend-path`) and passed to [node-http-proxy](https://github.com/http-party/node-http-proxy).
Pass the labels into your swarm compose file.
```yaml
# defining at this level takes priority
services:
  service-01:
    image:
    labels:
      page.agassi.vhost: example.com
      page.agassi.opts.target: http://service-01:80
# this means of labeling gets overwritten by the former
services:
  service-01:
    image:
    deploy:
      labels:
        page.agassi.vhost: example.com
        page.agassi.opts.target: http://service-01:80
```

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
htpasswd -n -B -C 24 user | base64 -w 0
```
```sh
openssl genrsa 4096 | docker secret create agassi_default_key -
```
