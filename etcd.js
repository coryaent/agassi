"use strict";


const Etcd = require ('node-etcd');
const print = require ('./print.js');
const bluebird = require ('bluebird'); bluebird.promisifyAll(Etcd.prototype);

print (`starting process...`);


print (`connecting to etcd...`);
const etcd = new Etcd (['192.168.1.10:2379', 'http://192.168.1.12:2379', 'http://192.168.1.13:2379']);

print (`setting keys...`);

etcd.mkdirSync("/dir");
etcd.setSync ('/dir/somekey', 'somevalue');
etcd.setSync ('/dir/anotherkey', 'somevalue');
etcd.setSync ('ttltest', 'test', {ttl:60});

print (`keys set...`);

print (`getting keys...`);

const allCerts = etcd.getSync ('/dir', {recursive: true});
print (allCerts);

(async () => { 
    try {
        let exists = (await etcd.getAsync ('/dir/somekey'));
        print (exists);
    } catch (error) {
        print ('key does not exist');
    };

    try {
        let doesnt = (await etcd.getAsync ('/dir/doesnotexist'));
        print (doesnt);
    } catch (error) {
        print ('key does not exist');
    };
    // let empty = etcd2.getSync ('vHosts', {recursive:true});
    // let ttltest = etcd2.getSync ('ttltest');

    // print (key);
    // print (key.value);
    // print (new Date(ttltest.body.node.expiration).toUTCString())
    // print (ttltest);
}) ();