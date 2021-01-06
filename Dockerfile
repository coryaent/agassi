# compile rqlited
FROM golang:1.15 AS rqlited-builder
WORKDIR /opt
COPY rqmkown.c ./rqmkown.c
RUN gcc rqmkown.c -o ./rqmkown && chmod ug+s ./rqmkown && \
    wget https://github.com/rqlite/rqlite/archive/v5.8.0.tar.gz && \
    tar xvf v5.8.0.tar.gz && \
    cd /opt/rqlite-5.8.0/cmd/rqlited && \
    go build -o /opt/rqlited && \
    cd /opt/rqlite-5.8.0/cmd/rqlite && \
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

EXPOSE 4000/udp
EXPOSE 4001
EXPOSE 4002

# copy requisite binaries
COPY --from=rqlited-builder /opt/rqmkown /usr/local/bin/rqmkown
COPY --from=rqlited-builder /opt/rqlited /usr/local/bin/rqlited
COPY --from=rqlited-builder /opt/rqlite /usr/local/bin/rqlite

COPY --from=agassi-bundler /opt/agassi /usr/local/bin/agassi

# allow system ports as non-root
RUN apt-get update && apt-get install -y libcap2-bin && apt-get clean && \
    setcap CAP_NET_BIND_SERVICE=+eip /usr/local/bin/agassi

USER 150:150

CMD [ "agassi" ]