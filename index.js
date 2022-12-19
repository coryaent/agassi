"use strict";


const Redis = require('ioredis')
const uuid = require('uuid');

const redis = new Redis({
    host: process.env.AGASSI_REDIS_HOST,
    port: process.env.AGASSI_REDIS_PORT
});
