# KeyDB
FROM debian:buster AS keydb-compiler

WORKDIR /usr/local/src

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
	wget

RUN VERSION="6.0.16" && \
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
FROM node:lts-buster

WORKDIR /usr/local/src

COPY --from=keydb-compiler /usr/local/bin/keydb-cli /usr/local/bin/keydb-cli
COPY --from=keydb-compiler /usr/local/bin/keydb-server /usr/local/bin/keydb-server

COPY --from=caddy-compiler /usr/local/bin/caddy /usr/local/bin/caddy
