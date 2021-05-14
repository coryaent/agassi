# KeyDB
FROM debian:buster AS keydb-compiler

WORKDIR /usr/local/src

COPY ./datamkown.c ./

RUN apt-get update && apt-get install -y \
	build-essential \
	nasm \
	autotools-dev \
	autoconf \
	libjemalloc-dev \
	tcl tcl-dev \
	uuid-dev \
	libssl-dev \
	libcurl4-openssl-dev \
	wget && \
	gcc datamkown.c -o ./datamkown && chmod ug+s ./datamkown && \
	VERSION="6.0.16" && \
	wget "https://github.com/EQ-Alpha/KeyDB/archive/refs/tags/v${VERSION}.tar.gz" && \
	tar xvf "v${VERSION}.tar.gz" && \
	cd "KeyDB-${VERSION}" && \
	make BUILD_TLS=yes && \
	cp src/keydb-* /usr/local/bin/

# Caddy
FROM golang:buster AS caddy-compiler

WORKDIR /usr/local/src

RUN apt-get update && apt-get install -y apt-transport-https curl && \
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/xcaddy/gpg.key' | apt-key add - && \
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/xcaddy/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-xcaddy.list && \
	apt-get update && \
	apt-get install -y xcaddy && \
	xcaddy build \
		--output /usr/local/bin/caddy \
		--with github.com/lucaslorentz/caddy-docker-proxy/plugin/v2 \
		--with github.com/gamalan/caddy-tlsredis

# Node.js
FROM node:lts-buster AS agassi-bundler

WORKDIR /opt

COPY package*.json ./
COPY . .

RUN npm install && \
    npm install --global pkg && \
    pkg index.js -o ./agassi


#####################
# primary container #
#####################
FROM debian:buster-slim

EXPOSE 80
EXPOSE 443

WORKDIR /usr/local/src

COPY --from=keydb-compiler /usr/local/bin/keydb-cli /usr/local/bin/keydb-cli
COPY --from=keydb-compiler /usr/local/bin/keydb-server /usr/local/bin/keydb-server
COPY --from=keydb-compiler /usr/local/src/datamkown /usr/local/bin/datamkown
COPY --from=caddy-compiler /usr/local/bin/caddy /usr/local/bin/caddy
COPY --from=agassi-bundler /opt/agassi /usr/local/bin/agassi

# install dependencies, allow system ports as non-root
RUN apt-get update && apt-get install -y \
	libatomic1=8.3.0-6 \
    curl=7.64.0-4+deb10u2 \
    netcat-openbsd=1.195-2 \
    && apt-get clean && \
    chmod ug+s /usr/local/bin/agassi && \
    curl https://raw.githubusercontent.com/stevecorya/wait-for-linked-services/master/wait-for-docker-socket \
    -o /usr/local/bin/wait-for-docker-socket && \
    chmod +x /usr/local/bin/wait-for-docker-socket

STOPSIGNAL SIGTERM

ENV DOCKER_HOST="unix:///var/run/docker.sock"

ENTRYPOINT wait-for-docker-socket $DOCKER_HOST && agassi
