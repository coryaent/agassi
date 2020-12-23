// watch for new ACME challenges
const challengeWatcher = etcd.watcher (challengeDir, null, {recursive: true})
.on ('set', async (event) => {

    // only the leader communicates that a challenge is ready
    print (`found new ACME challenge`);
    if (isLeader) {
        // queue the completion on the remote ACME server and wait
        print (`completing challenge and awaiting validation...`);
        const value = JSON.parse (event.node.value);
        await client.completeChallenge (value.challenge);
        await client.waitForValidStatus(value.challenge);

        // remove completed challeng
        print (`removing completed challenge...`);
        await etcd.delAsync (event.node.key);

        // challenge is complete and valid, send cert-signing request
        print (`creating CSR for ${value.domain} ...`);
        const [key, csr] = await acme.forge.createCsr({
            commonName: value.domain
        }, defaultKey);

        // finalize the order and pull the cert
        print (`finalizing order and downloading cert for ${value.domain} ...`);
        await client.finalizeOrder(value.order, csr);
        const cert = await client.getCertificate(value.order);

        // add cert to etcd with expiration
        print (`adding cert to etcd...`);
        await etcd.setAsync (`${certDir}/${value.domain}`, cert, {ttl: 7776000}); // 90-day ttl
    };
})
.on ('error', (error) => {
    print (error.name);
    print (error.message);
});

// watch for new certs
const certWatcher = etcd.watcher (certDir, null, {recursive: true})
.on ('set', (event) => {
    const domain = event.node.key.replace (`${certDir}/`, '');
    print (`found new cert for ${domain} in etcd`);
    certs.set (domain, event.node.value);
})
.on ('expire', (event) => {
    const domain = event.node.key.replace (`${certDir}/`, '');
    print (`cert for ${domain} expired`);
    certs.delete (domain);
})
.on ('error', (error) => {
    print (error.name);
    print (error.message);
});

// watch for new and/or removed virtual hosts
const vHostWatcher = etcd.watcher (vHostDir, null, {recursive: true})
.on ('set', (event) => {
    print (`found new virtual host in etcd`);
    const vHostDomain = event.node.key.replace (`${vHostDir}/`, '');
    const vHost = JSON.parse (event.node.value);
    print (`caching virtual host for ${vHostDomain} ...`);
    vHosts.set (vHostDomain, vHost);
})
.on ('delete', (event) => {
    print (`virtual host deleted in etcd`);
    const vHostDomain = event.node.key.replace (`${vHostDir}/`, '');
    print (`removing virtual host ${vHostDomain} from cache...`);
    vHosts.delete (vHostDomain);
})
.on ('error', (error) => {
    print (error.name);
    print (error.message);
});