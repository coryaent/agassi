"use strict";

const log = require ('../logger.js');

const isURL = require ('nice-is-url');
const normalizeURL = require ('normalize-url');

const Cache = require ('../cache.js');
const Config = require ('../config.js');

const optRegEx = /opt(?:(?:ion)?s|ion)?/i;
const vHostRegEx = /virtual(?:\-?hosts?)?/i;
const protocolRegEx = /https?|wss?/i;

// from https://github.com/casetext/optometrist/blob/master/index.js
function camelCase (text) {
    return text.replace (/(?:[_-])(\w)/g, function (_, c) {
        return c ? c.toUpperCase () : '';
    }); 
}

module.exports = class Service {
    constructor (serviceDetail) {
        this.id = serviceDetail.ID;
        this.labels = parseServiceLabels (serviceDetail);
    }

    isAgassiService () {
        
        // no labels at all, not an agassi service
        if (!Object.keys (this.labels).length > 0) {
            return false;
        }

        // validation
        //
        // find virtual hosts label
        const virtualHostsLabel = Object.keys (this.labels)
        .map  (label => label.replace (Config.serviceLabelPrefix, ''))  // remove prefix
        .find (label => vHostRegEx.test (label));                       // find the virtual hosts label
        if (virtualHostsLabel == undefined) {
            return false;
        } else {
            log.debug (`Found agassi service ${this.id}.`);
        }

        // chcek for valid virtual hosts
        const validVirtualHosts = this.labels[Config.serviceLabelPrefix + virtualHostsLabel]
        .split (',').map (vHost => vHost.trim ())
        .every (vHost => isValidVHost (vHost));

        // check that protocol is valid
        const validProtocol = protocolRegEx.test (this.labels[Config.serviceLabelPrefix + 'protocol']);

        // check for port validity
        const validPort = Number (this.labels [Config.serviceLabelPrefix + 'port']) > 0 && 
                          Number (this.labels [Config.serviceLabelPrefix + 'port']) < 65536;

        if (validVirtualHosts && validProtocol && validPort) {
            return true;
        }
    
        // if agassi.virtual-hosts and agassi.opt.target are set, the service is fine
        const options = parseProxyOptions (this.labels);
        if (validVirtualHosts && (isURL (options.target,  { requireProtocol: true }) || 
                                  isURL (options.forward, { requireProtocol: true }))) {
            return true;
        }
    
        // warnings
        //
        // one or more invalid virtual hosts
        if (!validVirtualHosts) {
            this.labels[Config.serviceLabelPrefix + virtualHostsLabel]
            .split (',').map (vHost => vHost.trim ())
            .forEach (vHost => {
                if (!isValidVHost (vHost)) {
                    log.warn (`Virtual host ${vHost} does not appear to be valid.`);
                }
            });
        }

        // invalid protocol
        if (this.labels[Config.serviceLabelPrefix + 'protocol'] && !validProtocol) {
            log.warn (`Protocol ${this.labels[Config.serviceLabelPrefix + 'protocol']} does not appear to be valid. Valid protocols are http(s) or ws(s).`);
        }

        // invalid port
        if (this.labels [Config.serviceLabelPrefix + 'port'] && !validPort) {
            log.warn (`Port ${this.labels [Config.serviceLabelPrefix + 'port']} does not appear to be valid.`);
        }

        // invalid target
        if (options.target && !isURL (options.target,  { requireProtocol: true })) {
            log.warn (`Target ${options.target} does not appear to be a valid URL.`);
        }

        // invalid forward
        if (options.forward && !isURL (options.forward, { requireProtocol: true })) {
            log.warn (`Forward address ${options.forward} does not appear to be a valid URL.`);
        }

        if (!this.labels[Config.serviceLabelPrefix + 'protocol'] ||
            !this.labels [Config.serviceLabelPrefix + 'port'] ||
            !options.target ||
            !options.forward) {
            log.warn (`Service ${this.id} has virtual-hosts but is missing one or more other requisite labels.`)
        }
        
        // all or nothing on the labels
        return false;
    }

    cache () {
        // find virtual-hosts label
        const virtualHostsLabel = Object.keys (this.labels)
        .map  (label => label.replace (Config.serviceLabelPrefix, ''))  // remove prefix
        .find (label => vHostRegEx.test (label)); 

        this.virtualHosts = this.labels[Config.serviceLabelPrefix + virtualHostsLabel].split (',')
                            .map (vHost => vHost.trim ())
                            .map (vHost => new URL (vHost).href)
                            .sort ();

        this.options = parseProxyOptions (this.labels);

        Cache.services.set (this.id, {
            virtualHosts: this.virtualHosts,
            options: this.options
        });

        this.virtualHosts.forEach (url => {
            Cache.virtualHosts.set (url, this.id);
        }, this);
    }
}

function parseServiceLabels (service) {
    // merge service labels, prefering container labels to service labels
    const labels = {};
    const labelsMap = new Map ();

    //  service:
    //    image:
    //    deploy:
    //      labels:
    if (service.Spec.Labels) {
        const serviceLabels = service.Spec.Labels;
        Object.keys (serviceLabels).forEach ((labelKey) => {
            labelsMap.set (labelKey, serviceLabels[labelKey]);
        });
    }

    //  service:
    //    image:
    //    labels:
    if (service.Spec.TaskTemplate.ContainerSpec.Labels) {
        const containerLabels = service.Spec.TaskTemplate.ContainerSpec.Labels;
        Object.keys (containerLabels).forEach ((labelKey) => {
            labelsMap.set (labelKey, containerLabels[labelKey]);
        });
    }

    labelsMap.forEach ((value, key) => {
        labels[key] = value;
    });

    return labels;
}

function parseProxyOptions (labels) {
    // http-proxy options
    const options = {};

    Object.keys (labels).forEach ((labelKey) => {
        // filter labels that start with the prefix
        if (labelKey.startsWith (Config.serviceLabelPrefix)) {
            const agassiLabel = labelKey.replace (Config.serviceLabelPrefix, '');
            // filter labels that define a proxy option
            if (optRegEx.test (agassiLabel)) {
                const optionKey = camelCase (agassiLabel.substring (agassiLabel.lastIndexOf (Config.serviceLabelSeperator) + 1));
                // set the proxy options
                switch (optionKey) {
                    case 'agent':
                    case 'ssl':
                    case 'ws':
                    case 'prependPath':
                    case 'ignorePath':
                    case 'selfHandleResponse':
                    case 'buffer':
                        log.warn (`Label ${labelKey} ignored.`);
                        break;
                    default:
                        options[optionKey] = labels[labelKey];
                }
            }
        }
    });

    return options;
}

function isValidVHost (input) {
    const url = new URL (normalizeURL (input, {
        defaultProtocol: 'https:',
        forceHttps: true
    }));

    if (url.protocol !== 'https:' ||
        url.username !== '' ||
        url.password !== '' ||
        url.port     !== '' ||
        url.search   !== '' ||
        url.searchParams.toString () !== '' ||
        url.hash !== '') {
        return false;
    } else {
        return true;
    }
}