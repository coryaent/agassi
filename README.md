![CodeFactor Grade](https://img.shields.io/codefactor/grade/github/coryaent/agassi?style=flat-square)

# Agassi
Agassi is inspired by the setup detailed at [Docker Swarm Rocks](https://dockerswarm.rocks/). When Traefik dropped support for distributed certificate storage, it created a situation where all certificates were stored locally on a single machine. This removed redundency from the setup.

Taking advantage of etcd and Docker Swarm's built-in state management, Agassi is able to run without the use of generative templates. Each agassi service is mapped to a virtual host, which are created by the client and retrieved by the server.

By using Agassi, you are accepting the [Let's Encrypt Subscriber Agreement](https://letsencrypt.org/repository/). 

## Configuration

ENVAR | Detail | Default
--- | --- | ---
`AGASSI_ACME_ACCOUNT_KEY_FILE` | the path to the key to the ACME account |
`AGASSI_ACME_STAGING` | if set to any value, fetch certificates from Let's Encrypt staging |
`AGASSI_ACME_TIMEOUT` | seconds before fetching the certificate times out | 30
`AGASSI_AUTH_REALM` | the realm to use from basic authentication | Agassi
`AGASSI_CPANEL_API_TOKEN_FILE` | the path to the cPanel API token |
`AGASSI_CPANEL_SERVER` | the base URL for the cpanel endpoint |
`AGASSI_CPANEL_USERNAME` | the username to log in to cPanel |
`AGASSI_DEFAULT_KEY_FILE` | the path to the default key used for signing certificates |
`AGASSI_DNS_TTL` | the time to live for DNS records (seconds) | 14400
`AGASSI_DOCKER_API_VERSION` | passed to [dockerode](https://github.com/apocas/dockerode) | v1.37
`AGASSI_DOCKER_HOST` | TCP socket passed to dockerode | localhost
`AGASSI_DOCKER_PORT` | TCP port passed to dockerode | 2375
`AGASSS_ETCD_HOSTS` | comma-seperated array of strings of etcd3 hosts | http://localhost:2379
`AGASSI_EXPIRATION_THRESHOLD` | days before certificate expires to renew | 45
`AGASSI_LABEL_PREFIX` | label prefix to define virtual hosts | page.agassi.
`AGASSI_LETS_ENCRYPT_EMAIL` | email address used to send certificate renewal notifications |
`AGASSI_LOG_LEVEL` | trace, debug, info, warn, error, fatal | info
`AGASSI_MAINTENANCE_INTERVAL` | how often to prune services and update certificates (hours) | 12
`AGASSI_TARGET_CNAME`* | cname value to which DNS records point |

`* this must end with a dot, e.g., subdomain.example.com.`

## Labels
- `page.agassi.domain` set to your target domain e.g. `example.com`
- `page.agassi.auth` see [Authorization](#authorization) for how to generate an auth string
- `page.agassi.options.target` the service access address for example `http://myservice:80`
All options prefixed with `page.agassi.options.` are camel-cased (set `prependPath` with the label `page.agassi.opts.prepend-path`) and passed to [node-http-proxy](https://github.com/http-party/node-http-proxy).
Pass the labels into your swarm compose file.
```yaml
services:
  service-01:
    image:
    deploy:
      labels:
        page.agassi.domain: example.com
        page.agassi.options.target: http://service-01:80
```

## Flow
Agassi requires the use of two seperate services, a client (ACME, etcd, and docker) and a server (HTTPS).
### Client
Client spins up.

Client checks for existing services and makes sure certificates are current.

Client subscribes to new service updates.

### Server
Server spins up.

Starts listening to HTTPS requests.

## Authorization
To generate a basic auth parameter:
```sh
echo $(htpasswd -n -B -C 4 user | base64 -w 0)
```
To generate a default and ACME account key
```sh
openssl genrsa 4096 | docker secret create my_key -
```
