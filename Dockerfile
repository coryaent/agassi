# compile rqlited
FROM golang:1.15 AS rqlited-builder
WORKDIR /opt
COPY rqmkown.c ./rqmkown.c
RUN gcc rqmkown.c -o ./rqmkown && chmod ug+s ./rqmkown && \
    wget https://github.com/rqlite/rqlite/archive/v5.6.0.tar.gz && \
    tar xvf v5.6.0.tar.gz && \
    cd rqlite-5.6.0/cmd/rqlited && \
    go build -o /opt/rqlited

# compile shipwreck
FROM rust:1.34.2 AS shipwreck-builder
WORKDIR /opt
COPY shipwrecker.c ./shipwrecker.c
RUN gcc shipwrecker.c -o ./shipwrecker && chmod ug+s ./shipwrecker && \
    wget https://github.com/Drakulix/shipwreck/archive/v0.1.5.tar.gz && \
    tar xvf v0.1.5.tar.gz && \
    cd shipwreck-0.1.5 && \
    cargo build --release --target-dir /opt 

# bundle agassi
FROM node:12 AS agassi-bundler
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

# copy requisite binaries
COPY --from=rqlited-builder /opt/rqmkown /usr/local/bin/rqmkown
COPY --from=rqlited-builder /opt/rqlited /usr/local/bin/rqlited

COPY --from=shipwreck-builder /opt/shipwrecker /usr/local/bin/shipwrecker
COPY --from=shipwreck-builder /opt/release/shipwreck /usr/local/bin/shipwreck

COPY --from=agassi-bundler /opt/agassi /usr/local/bin/agassi

# allow system ports as non-root
RUN apt-get update && apt-get install -y libcap2-bin && apt-get clean && \
    setcap CAP_NET_BIND_SERVICE=+eip /usr/local/bin/agassi

# expose ports for web, discovery, and rqlited
EXPOSE 80
EXPOSE 443

EXPOSE 4000/udp
EXPOSE 4001
EXPOSE 4002

USER 150:150

CMD [ "agassi" ]