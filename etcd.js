"use strict";


const Etcd2 = require ('node-etcd');
const DateFormat = require ('fast-date-format');


const dateFormat = new DateFormat('YYYY[-]MM[-]DD HH[:]mm[:]ss');

console.log (`[${dateFormat.format(new Date())}] starting process...`);


console.log (`[${dateFormat.format(new Date())}] connecting to etcd...`);
const etcd2 = new Etcd2 (['192.168.1.10:2379', 'http://192.168.1.12:2379', 'http://192.168.1.13:2379']);

console.log (`[${dateFormat.format(new Date())}] setting key...`);

etcd2.set("key", "value");
console.log (`[${dateFormat.format(new Date())}] key set...`);
