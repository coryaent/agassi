"use strict";

const dolphin = require ('dolphin')();
const print = require ('./print.js');

// print ('fetching networks...');
// dolphin.networks().then ((networks) => print (networks));

print ('watching events...');
dolphin.events({})
.on ('event', (event) => {
    // on container creation
    console.log (event);
})
.on ('error', (error) => {
	console.error ('Error:', error);
});