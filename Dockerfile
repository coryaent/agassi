# compile rqlited
FROM golang:1.15 AS rqlited-builder
ENV RQLITE_VERSION=5.8.0
WORKDIR /opt
COPY rqmkown.c ./rqmkown.c
RUN gcc rqmkown.c -o ./rqmkown && chmod ug+s ./rqmkown && \
    wget https://github.com/rqlite/rqlite/archive/v${RQLITE_VERSION}.tar.gz && \
    tar xvf rqlite-${RQLITE_VERSION}.tar.gz && \
    cd /opt/rqlite-${RQLITE_VERSION}/cmd/rqlited && \
    go build -o /opt/rqlited && \
    cd /opt/rqlite-${RQLITE_VERSION}/cmd/rqlite && \
    go build -o /opt/rqlite

# bundle agassi
FROM node:14 AS agassi-bundler
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

# expose ports for web, discovery, and rqlited
EXPOSE 80
EXPOSE 443

EXPOSE 4001
EXPOSE 4002
EXPOSE 4002/udp

# copy requisite binaries
COPY --from=rqlited-builder /opt/rqmkown /usr/local/bin/rqmkown
COPY --from=rqlited-builder /opt/rqlited /usr/local/bin/rqlited
COPY --from=rqlited-builder /opt/rqlite /usr/local/bin/rqlite

COPY --from=agassi-bundler /opt/agassi /usr/local/bin/agassi

# copy nsswitch.conf
COPY nsswitch.conf /etc/nsswitch.conf

# allow system ports as non-root
RUN apt-get update && apt-get install -y libcap2-bin && apt-get clean && \
    setcap CAP_NET_BIND_SERVICE=+eip /usr/local/bin/agassi

USER 150:150

VOLUME ["/data"]

ENTRYPOINT ["agassi"]