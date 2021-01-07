"use strict";

const Config = require ('./config.js');

const Docker = require ('dockerode');
const DockerEvents = require ('docker-events');

const rqlite = require ('./rqlite.js');

// parse docker socket host, dropping protocol per
// https://github.com/apocas/docker-modem/issues/31#issuecomment-68103138
const dockerURL = new URL (Config.dockerSocket);

const docker = new Docker ({
    host: dockerURL.hostname,
    port: dockerURL.port
});

const dockerEvents = new DockerEvents ({
    docker: docker
});

const requisiteLabels = ['protocol', 'domain', 'port'];

module.exports = {
    API: docker,

    Events: dockerEvents,

    isAgassiService: (service) => {

        return requisiteLabels.every ((requisiteLabel) => {
            Object.keys (service.Spec.Labels).some ((serviceLabel) => {
                serviceLabel == Config.serviceLabelPrefix + requisiteLabel;
            });
        });
    },

    addServiceToDB: async (serviceOrID) => {
        var service = null;

        if (typeof serviceOrID == 'string') {
            service = await docker.getService (serviceOrID).inspect ();
        } else {
            service = serviceOrID;
        }

        const id = service.ID;
        const protocol = service.Spec.Labels[Config.serviceLabelPrefix + 'protocol'];
        const hostname = service.Spec.TaskTemplate.ContainerSpec.Hostname ? 
            service.Spec.TaskTemplate.ContainerSpec.Hostname : service.Spec.Name;
        const port = Number.parseInt (service.Spec.Labels[Config.serviceLabelPrefix + 'port'], 10);
        const domain = service.Spec.Labels[Config.serviceLabelPrefix + 'domain'];
        const auth = service.Spec.Labels[Config.serviceLabelPrefix + 'auth'] ?
            service.Spec.Labels[Config.serviceLabelPrefix + 'auth'] : null;

        return await rqlite.dbExecute (`INSERT OR REPLACE INTO services (id, protocol, hostname, port, domain, auth)
        VALUES ('${id}', '${protocol}', '${hostname}', ${port}, '${domain}', '${auth}');`, 'strong');
    },

    removeServiceFromDB: async (serviceOrID) => {
        var id = null;

        if (typeof serviceOrID == 'object') {
            id = service.ID;
        } else {
            id = serviceOrID;
        }

        

    }
};