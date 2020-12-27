"use strict";

module.exports.services = {
    createTable: 
        `CREATE TABLE IF NOT EXISTS services (
            id TEXT PRIMARY KEY,
            protocol TEXT NOT NULL,
            hostname TEXT NOT NULL,
            port INTEGER NOT NULL,
            auth TEXT 
        );`,
};

module.exports.challenges = {
    createTable:
        `CREATE TABLE IF NOT EXISTS challenges (
            token TEXT PRIMARY KEY,
            response TEXT NOT NULL
        );`,
};

module.exports.certificates = {
    createTable:
        `CREATE TABLE IF NOT EXISTS certificates (
            hostname TEXT PRIMARY KEY,
            certificate TEXT NOT NULL,
            expiration INTEGER NOT NULL
        );`,
};