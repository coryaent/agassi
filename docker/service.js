"use strict";

const { parseServiceLabels } = require ('../docker.js');

class Service {
    constructor (serviceDetail) {
        this.id = serviceDetail.ID;
        this.labels = parseServiceLabels (serviceDetail);
    }
}