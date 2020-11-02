"use strict";


const Etcd2 = require ('node-etcd');
const print = require ('./print.js');

print (`starting process...`);


print (`connecting to etcd...`);
const etcd2 = new Etcd2 (['192.168.1.10:2379', 'http://192.168.1.12:2379', 'http://192.168.1.13:2379']);

print (`starting watcher...`);
const watcher = etcd2.watcher('/dir' , null, {recursive: true});
// watcher.on("change", print); // Triggers on all changes
watcher.on("set", print);    // Triggers on specific changes (set ops)
watcher.on("delete", print); // Triggers on delete.
watcher.on ('expire', print);
watcher.on("error", print);