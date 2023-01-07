"use strict";

async function addServiceToDB {

    log.debug ('found agassi service')
    // `SET service:[service id] [vhost]`
    log.debug ('setting service -> vhost');
    await redis.set (`service:${id}`, getVHost (service) );
    log.debug ('setting vhost hash');
    await redis.hset (`vhost:${getVHost (service)}`, 'auth', getAuth (service), 'options', JSON.stringify (getOptions (service)));
    if (!redis.hexists (`cert:${getVHost(service)}`, 'cert')) {
        // need to fetch and add the certificate
        let [cert, expiration] = await fetchCertificate (getVHost (service));
        // log.debug (cert);
        log.debug (expiration);
        log.debug ('adding cert to redis');
        // Math.floor (new Date (expiration).getTime ()/ 1000)
        await redis.hset (`cert:${getVHost (service)}`, 'cert', cert, 'expiration', expiration);
    // set dns record
    await setCnameRecord (getVHost (service));
}

async function removeServiceFromDB (service) {
    log.debug ('removing vhost');
    let vHost = await redis.get ('service:' + event.Actor.ID);
    log.debug (vHost);
    let res = await redis.hdel ('vhost:' + vHost);
    log.debug (res);
    log.debug ('removing service');
    res = await redis.del ('service:' + event.Actor.ID);
    log.debug (res);
}
