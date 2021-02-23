"use strict";

module.exports.services = {
    createTable: 
        `CREATE TABLE IF NOT EXISTS services (
            id TEXT PRIMARY KEY,
            domain TEXT NOT NULL,
            options TEXT NOT NULL,
            protocol TEXT,
            hostname TEXT,
            port INTEGER,
            auth TEXT
        );`,
};

module.exports.challenges = {
    createTable:
        `CREATE TABLE IF NOT EXISTS challenges (
            token TEXT NOT NULL,
            response TEXT NOT NULL,
            acme_order TEXT NOT NULL
        );`,
};

module.exports.certificates = {
    createTable:
        `CREATE TABLE IF NOT EXISTS certificates (
            domain TEXT NOT NULL,
            certificate TEXT NOT NULL,
            expiration INTEGER NOT NULL
        );`,
};