"use strict";

const dolphin = require ('dolphin')();


dolphin.events({})
.on ('event', (event) => {
    // on container creation
    console.log (event);
})
.on ('error', (error) => {
	console.error ('Error:', error);
});