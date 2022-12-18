"use strict";


const {createSafeRedisLeader} = require('safe-redis-leader')
const Redis = require('ioredis')
const uuid = require('uuid');

async function main(){

    const myUuid = uuid.v4 ();
    console.log ('uuid: ' + myUuid);
    console.log ('host: ' + process.env.AGASSI_REDIS_HOST);
    const asyncRedis = new Redis({
        host: process.env.AGASSI_REDIS_HOST,
        port: 6379
    })
    const leaderElectionKey = 'the-election'
    const safeLeader = await createSafeRedisLeader({
        asyncRedis: asyncRedis,
        ttl: 1500,
        wait: 3000,
        key: leaderElectionKey
    })

    safeLeader.on("elected", ()=>{
        console.log("I'm the leader - " + myUuid)
    })

    await safeLeader.elect()
}

 main().catch((e)=>{
    console.error(e)
    process.exit(1)
 })
