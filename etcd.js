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

(async () => { 
    let key = (await etcd.getAsync ('/challenges/XWvxqYSoyN27sn5wXN4pDxjzhLmad8sXYaUvQgFdyrQ')).node.value;
    // let empty = etcd2.getSync ('vHosts', {recursive:true});
    // let ttltest = etcd2.getSync ('ttltest');

    // print (key);
    print (JSON.parse(key).response);
    // print (key.value);
    // print (new Date(ttltest.body.node.expiration).toUTCString())
    // print (ttltest);
}) ();