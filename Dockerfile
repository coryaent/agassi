FROM node:18

ENV AGASSI_AUTH_REALM=Agassi
ENV AGASSI_DOCKER_API_VERSION=v1.37
ENV AGASSI_DOCKER_PORT=2375
ENV AGASSI_EXPIRATION_THRESHOLD=45
ENV AGASSI_LABEL_PREFIX=page.agassi.
ENV AGASSI_LOG_LEVEL=info
ENV AGASSI_MAINTENANCE_INTERVAL=60
ENV AGASSI_REDIS_PORT=6379

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# Bundle app source
COPY . .

EXPOSE 443

ENTRYPOINT ["node", "index.js"]
