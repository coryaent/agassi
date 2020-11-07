"use strict";

const bcrypt = require ('bcryptjs');
const memoize = require ('fast-memoize');

// can memoize async
const compareHash = memoize(bcrypt.compare);
(async () => { 

    // const salt = await bcrypt.genSalt (14);
    // const salt = bcrypt.genSalt (14);

    // let salted = process.hrtime.bigint();
    // console.log (`salt time: ${Number (salted - start) / 1e6} ms`);
    // console.log (typeof salt)

    const hash = process.argv[2];
    console.log (hash);

    let hashed = process.hrtime.bigint();
    // console.log (`hash time: ${Number (hashed - salted) / 1e6} ms`);
    let comp1 = await compareHash('pass', hash);
    let compared = process.hrtime.bigint();
    console.log (comp1);
    // console.log ( compareHash('pass', hash) );

    console.log (`comparison time: ${Number (compared - hashed) / 1e6} ms`);
    compared = process.hrtime.bigint();
    let comp2 = await compareHash('pass', hash);
    let memoized = process.hrtime.bigint();
    console.log (comp2);

    console.log (`memoized hash: ${Number (memoized - compared) / 1e6} ms`);
}) ();