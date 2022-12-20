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

const optRegEx = /opt(?:(?:ion)?s|ion)?/i;

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

function camelCase (text) {
    return text.replace (/(?:[_-])(\w)/g, function (_, c) {
        return c ? c.toUpperCase () : '';
    }); 
}
