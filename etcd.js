"use strict";


const Etcd2 = require ('node-etcd');
const print = require ('./print.js');

print (`starting process...`);


print (`connecting to etcd...`);
const etcd2 = new Etcd2 (['192.168.1.10:2379', 'http://192.168.1.12:2379', 'http://192.168.1.13:2379']);

print (`setting keys...`);

etcd2.mkdirSync("/dir");
etcd2.setSync ('/dir/somekey', 'somevalue');
etcd2.setSync ('/dir/anotherkey', 'somevalue');
etcd2.setSync ('ttltest', 'test', {ttl:60});

print (`keys set...`);

print (`getting keys...`);

let key = etcd2.getSync ('/dir/somekey').body.node.value;
// let empty = etcd2.getSync ('vHosts', {recursive:true});
// let ttltest = etcd2.getSync ('ttltest');


print (key);
print (key.value);
// print (new Date(ttltest.body.node.expiration).toUTCString())
// print (ttltest);