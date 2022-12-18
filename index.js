"use strict";


const {createSafeRedisLeader} = require('safe-redis-leader')
const Redis = require('ioredis')
const uuid = require('uuid');

const redis = new Redis({
    host: process.env.AGASSI_REDIS_HOST,
    port: 6379
})
redis.set("mykey", "value"); // Returns a promise which resolves to "OK" when the command succeeds.

// ioredis supports the node.js callback style
redis.get("mykey", (err, result) => {
  if (err) {
    console.error(err);
  } else {
    console.log(result); // Prints "value"
  }
});

// Or ioredis returns a promise if the last argument isn't a function
redis.get("mykey").then((result) => {
  console.log(result); // Prints "value"
});
