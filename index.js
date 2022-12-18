"use strict";


const {createSafeRedisLeader} = require('safe-redis-leader')
const Redis = require('ioredis')

async function main(){

    const asyncRedis = new Redis({
        host: "192.168.100.10",
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
        console.log("I'm the leader - 1")
    })

    await safeLeader.elect()
}

 main().catch((e)=>{
    console.error(e)
    process.exit(1)
 })
