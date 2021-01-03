"use strict";

const dockerCaller = require ('./docker.js');

dockerCaller.setme = 'meisset';
dockerCaller.someThis ();
dockerCaller.another.anotherThis ();
console.log (dockerCaller);

dockerCaller.thisIsNotDefined.on ('blahblah', (blah) => {
    console.log (blah);
});