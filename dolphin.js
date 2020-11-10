"use strict";

const dolphin = require ('dolphin')();
const Docker = require ('dockerode'); const docker = new Docker ();
const print = require ('./print.js');
const util = require ('util');

// print ('fetching networks...');
// dolphin.networks().then ((networks) => print (networks));

print ('watching events...');
dolphin.events({})
.on ('event', async (event) => {
    // on service things
    if (event.Type == 'service') {
        console.log (`EVENT: ${event}`);
        console.log (`ID: ${event.Actor.ID}`);
        const service = await docker.getService(event.Actor.ID).inspect();
        console.log (`SERVICE: ${util.inspect(service, false, null)}`);
    };
})
.on ('error', (error) => {
	console.error ('Error:', error);
});