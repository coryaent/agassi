"use strict";

module.exports.services = {
    createTable: 
        `CREATE TABLE IF NOT EXISTS services (
            id TEXT PRIMARY KEY,
            protocol TEXT NOT NULL,
            hostname TEXT NOT NULL,
            port INTEGER NOT NULL,
            domain TEXT NOT NULL,
            auth TEXT
        );`,
};

module.exports.challenges = {
    createTable:
        `CREATE TABLE IF NOT EXISTS challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL
            token TEXT NOT NULL,
            response TEXT NOT NULL
        );`,
};

module.exports.certificates = {
    createTable:
        `CREATE TABLE IF NOT EXISTS certificates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            certificate TEXT NOT NULL,
            expiration INTEGER NOT NULL
        );`,
};