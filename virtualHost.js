"use strict";
/*

an agassi virtual host is defined by docker service labels labels:
  page.agassi.domain: 'some.fully.qualified.domain.name'
  page.agassi.authentication: 'dXNlcjokMnkkMDgkS3JxSkJIWWRnSXBNTlU3bDRsaXlGT3NsWUQyZmkwSHprNkhDY3dFRDBsRTNkb1dKWVUxd20KCg=='
      // authentication can be generated using htpasswd -B -n -C 8 user | printf %s\n $(base64 -w 0 -)`
  page.agassi.options.target: 'http://some_service_name:8080' (can be anything reachable)
  page.agassi.options.another-option: 'option_value' // gets passed to http-proxy as anotherOption

the data that constitutes an agassi virtual host goes like this:
  {
    domain: "...",
    authentication: "...",
    serviceID: "...",
    UpdatedAt: "2011-10-05T14:48:00.000Z", // ISO String date, capitalized for consistency with the docker API
    options: {
      target: "...",
      "anotherOption": "..."
    }
  }

*/

const log = require ('./logger.js');

const domainRegEx = /(?:domai|fqd)n/;
const optRegEx = /opt(?:(?:ion)?s|ion)?/i;
const authRegEx = /auth(?:entication)?/;

module.exports = {
    parseVirtualHost: function (service) {
        const labels = service.Spec.Labels;

        // no labels at all, not an agassi service
        if (!Object.keys (labels).length > 0) {
            return false;
        }

        for (let labelKey of Object.keys (labels)) {
            // only check agassi service labels
            if (labelKey.startsWith (process.env.AGASSI_LABEL_PREFIX)) {
                const agassiLabel = labelKey.replace (process.env.AGASSI_LABEL_PREFIX, '');
                // every agassi service will have a domain
                if (domainRegEx.test (agassiLabel)) {
                    // any agassi service must have a target or a forward option
                    if (getOptions (service)['forward'] || getOptions (service)['target']) {
                        let virtualHost = {};
                        virtualHost['domain'] = getDomain (service);
                        virtualHost['authentication'] = getAuth (service);
                        virtualHost['serviceID'] = service.ID;
                        virtualHost['UpdatedAt'] = service.UpdatedAt;
                        virtualHost['options'] = getOptions (service);
                        return virtualHost;
                    }
                }
            }
        }
        return null;
    }
}

function getAuth (service) {
    const labels = service.Spec.Labels;
    const authLabel = Object.keys (labels)
        .map  (label => label.replace (process.env.AGASSI_LABEL_PREFIX, ''))  // remove prefix
        .find (label => authRegEx.test (label));            // find the auth label

    return labels[process.env.AGASSI_LABEL_PREFIX + '' + authLabel];
}

function getDomain (service) {
    const labels = service.Spec.Labels;
    const domainLabel = Object.keys (labels)
        .map  (label => label.replace (process.env.AGASSI_LABEL_PREFIX, ''))  // remove prefix
        .find (label => domainRegEx.test (label));            // find the domain label

    return labels[process.env.AGASSI_LABEL_PREFIX + '' + domainLabel];
}

// pass return from parseServiceLabels
function getOptions (service) {

    const labels = service.Spec.Labels;
    // http-proxy options
    const options = {};

    Object.keys (labels).forEach ((labelKey) => {
        // filter labels that start with the prefix
        if (labelKey.startsWith (process.env.AGASSI_LABEL_PREFIX)) {
            const agassiLabel = labelKey.replace (process.env.AGASSI_LABEL_PREFIX, '');
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
