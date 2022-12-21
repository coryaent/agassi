"use strict";


const Redis = require('ioredis')
const Docker = require ('dockerode');

// check argv
if (!process.argv.includes ('--client') && !process.argv.includes ('--server')) {
    console.error ('must specify client or server mode');
    process.exit (1);
}
if (process.argv.includes ('--client') && process.argv.includes ('--server')) {
    console.error ('cannot run as client and server simultaneously');
    process.exit (1);
}

// initialization
const redis = new Redis({
    host: process.env.AGASSI_REDIS_HOST,
    port: process.env.AGASSI_REDIS_PORT
});

const docker = new Docker ({
    host: process.env.AGASSI_DOCKER_HOST,
    port: process.env.AGASSI_DOCKER_PORT,
    version: 'v1.37'
});

// if client start monitoring docker socket
if (process.argv.includes ('--client')) {
    docker.getEvents ({ filters: { type: ["service"]}}).then (events => {
        events.on ('data', async (data) => {
            let event = JSON.parse (data);
            console.log (event);
            if (event.Action == 'create' || event.Action == 'update') {
                let service = await docker.getService (event.Actor.ID);
                service = await service.inspect ();
                console.log (service);
                console.log (parseServiceLabels (service));
                console.log (parseProxyOptions (parseServiceLabels (service)));
            }
            if (event.Action == 'remove') {
            }
        });
    });
}

// if server start HTTPS server
if (process.argv.includes ('--server')) {

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
                        console.log (`option ${optionKey} from label ${labelKey} ignored`);
                        break;
                    case 'ssl':
                        console.log (`option ${optionKey} from label ${labelKey} ignored`);
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
                        console.log (`option ${optionKey} from label ${labelKey} ignored`);
                        break;
                    case 'cookiePathRewrite':
                        console.log (`option ${optionKey} from label ${labelKey} ignored`);
                        break;
                    case 'headers':
                        console.log (`option ${optionKey} from label ${labelKey} ignored`);
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
                        console.log (`option ${optionKey} from label ${labelKey} ignored`);
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
