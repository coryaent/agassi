"use strict";

const DateFormat = require ('fast-date-format');
const dateFormat = new DateFormat('YYYY[-]MM[-]DD HH[:]mm[:]ss');

module.exports = require('console-log-level') ({
    prefix: function (level) {
        return `[agassi] ${dateFormat.format (new Date ())} [${level}]`
    },
    level: 'info'
});