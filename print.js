"use strict";

const DateFormat = require ('fast-date-format');
const util = require ('util')

const dateFormat = new DateFormat('YYYY[-]MM[-]DD HH[:]mm[:]ss');

module.exports = (output) => {
    if (typeof output === 'object') {
        console.log (`[${dateFormat.format(new Date())}] ${util.inspect(output, false, null)}`)
    } else {
        console.log (`[${dateFormat.format(new Date())}] ${output}`);
    };
};