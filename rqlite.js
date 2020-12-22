"use strict";

const os = require ('os');
const fs = require ('fs');
const { spawn, execFileSync } = require ('child_process');

module.exports.daemon = 
spawn ('csync2', ['-ii', '-D', DB], {
    stdio: ['ignore', 'inherit', 'inherit']
})
.on ('error', (error) => {
    console.error ('Failed to start Csync2 subprocess.');
    console.error (error);
    process.exitCode = 1;
});