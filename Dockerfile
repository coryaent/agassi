FROM node:18

ENV AGASSI_DOCKER_API_VERSION=v1.37
ENV AGASSI_LOG_LEVEL=info

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
