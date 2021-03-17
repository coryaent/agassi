"use strict";

const Discover = require ('node-discover');
const EventEmitter = require ('events');

class Discovery extends EventEmitter {
    constructor (options) {
        super ();
        this._settings = {};
        for (let key of Object.keys (options)) {
            this._settings[key] = options[key];
        }
        this._discover = Object.create (Discover.prototype);
    }

    start (options) {
        for (let key of Object.keys (options)) {
            this._settings[key] = options[key];
        }
        this._settings.start = true;

        this._discover = Discover (this._settings);
        this._discover.join ('message', (data) => {
            this.emit (data['_ch'], data['msg']);
        });
        this._discover.on ('promotion', () => this.emit ('promotion'));
        this._discover.on ('demotion', () => this.emit ('demotion'));
        this._discover.on ('added', (node) => this.emit ('added', node));
        this._discover.on ('removed', (node) => this.emit ('removed', node));
        this._discover.on ('master', (node) => this.emit ('master', node));
        this._discover.on ('started', () => this.emit ('started'));
        this._discover.on ('stopped', () => this.emit ('stopped'));

        return this;
    }

    send (channel, message) {
        return this._discover.send ('message', {
            "_ch": channel,
            "msg": message
        });
    }

    advertise (advertisement) {
        return this._discover.advertise (advertisement);
    }

    isMaster () {
        return this._discover.me.isMaster;
    }

    peers () {
        return Object.values (this._discover.nodes);
    }

    stop () {
        return this._discover.stop ();
    }
}

module.exports = new Discovery ();