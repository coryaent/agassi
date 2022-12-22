"use strict";

const log = require ('./logger.js');

const isValidDomain = require ('is-valid-domain');

module.exports = {
    isAgassiService: function (service) {

        const vHostRegEx = /v(?:irtual\-?)?host/;
        const labels = parseServiceLabels (service);

        // no labels at all, not an agassi service
        if (!Object.keys (labels).length > 0) {
            return false;
        }
        const virtualHostsLabel = Object.keys (labels)
            .map  (label => label.replace ('site.agassi.', ''))  // remove prefix
            .find (label => vHostRegEx.test (label));            // find the virtual hosts label
        if (virtualHostsLabel == undefined) {
            return false;
        }
        return true;
    }
    // get vHost and auth
    // get options
}
// pass service details
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

// pass return from parseServiceLabels
function parseProxyOptions (labels) {
    const optRegEx = /opt(?:(?:ion)?s|ion)?/i;
    // http-proxy options
    const options = {};

    Object.keys (labels).forEach ((labelKey) => {
        // filter labels that start with the prefix
        if (labelKey.startsWith ('site.agassi.')) {
            const agassiLabel = labelKey.replace ('site.agassi.', '');
            // filter labels that define a proxy option
            if (optRegEx.test (agassiLabel)) {
                const optionKey = camelCase (agassiLabel.substring (agassiLabel.lastIndexOf ('.') + 1));
                // set the proxy options
                switch (optionKey) {
                    case 'target':
                        options[optionKey] = labels[labelKey];
                        break;
                    case 'forward':
                        options[optionKey] = labels[labelKey];
                        break;
                    case 'agent':
                        log.warn (`option ${optionKey} from label ${labelKey} ignored`);
                        break;
                    case 'ssl':
                        log.warn (`option ${optionKey} from label ${labelKey} ignored`);
                        break;
                    case 'ws':
                        options[optionKey] = strToBool (labels[labelKey]);
                        break;
                    case 'xfwd':
                        options[optionKey] = strToBool (labels[labelKey]);
                        break;
                    case 'secure':
                        options[optionKey] = strToBool (labels[labelKey]);
                        break;
                    case 'toProxy':
                        options[optionKey] = strToBool (labels[labelKey]);
                        break;
                    case 'prependPath':
                        options[optionKey] = strToBool (labels[labelKey]);
                        break;
                    case 'ignorePath':
                        options[optionKey] = strToBool (labels[labelKey]);
                        break;
                    case 'localAddress':
                        options[optionKey] = labels[labelKey];
                        break;
                    case 'changeOrigin':
                        options[optionKey] = strToBool (labels[labelKey]);
                        break;
                    case 'preserveHeaderKeyCase':
                        options[optionKey] = strToBool (labels[labelKey]);
                        break;
                    case 'auth':
                        options[optionKey] = labels[labelKey];
                        break;
                    case 'hostRewrite':
                        options[optionKey] = strToBool (labels[labelKey]);
                        break;
                    case 'autoRewrite':
                        options[optionKey] = strToBool (labels[labelKey]);
                        break;
                    case 'protocolRewrite':
                        options[optionKey] = labels[labelKey];
                        break;
                    case 'cookieDomainRewrite':
                        log.warn (`option ${optionKey} from label ${labelKey} ignored`);
                        break;
                    case 'cookiePathRewrite':
                        log.warn (`option ${optionKey} from label ${labelKey} ignored`);
                        break;
                    case 'headers':
                        log.warn (`option ${optionKey} from label ${labelKey} ignored`);
                        break;
                    case 'proxyTimeout':
                        options[optionKey] = Number.parseInt (labels[labelKey]);
                        break;
                    case 'timeout':
                        options[optionKey] = Number.parseInt (labels[labelKey]);
                        break;
                    case 'followRedirects':
                        options[optionKey] = strToBool (labels[labelKey]);
                        break;
                    case 'selfHandleResponse':
                        options[optionKey] = strToBool (labels[labelKey]);
                        break;
                    case 'buffer':
                        log.warn (`option ${optionKey} from label ${labelKey} ignored`);
                        break;
                }
            }
        }
    });

    return options;
}

function strToBool (string) {
    if (string == 'true') return true;
    if (string == 'false') return false;
}

function camelCase (text) {
    return text.replace (/(?:[_-])(\w)/g, function (_, c) {
        return c ? c.toUpperCase () : '';
    });
}

