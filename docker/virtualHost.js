"use strict";

class VirtualHost {
    constructor (hostname, pathname, options) {
        this.id = hostname + pathname;
        this.hostname = hostname;
        this.pathname = pathname;
        this.options = options;
    }
}

module.exports = VirtualHost;