"use strict";

const log = require ('./logger.js');
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
        // which labels it has
        const has = {};

        // for every requisite label
        const hasAll = requisiteLabels.every ((requisiteLabel) => {
            // check that some service label is set
            const hasRequisiteLabel = Object.keys (service.Spec.Labels).some ((serviceLabel) => {
                return serviceLabel == Config.serviceLabelPrefix + requisiteLabel;
            });
            // track which labels are (not) set for debugging
            has[requisiteLabel] = hasRequisiteLabel;
            return hasRequisiteLabel;
        });

        // has all requisite labels, nothing to debug
        if (hasAll) {
            return true;
        }

        // has no labels, nothing to debug
        if (Object.values (has).every (label => {return !label;})) {
            return false;
        }

        // has some but not all requisite labels
        Object.keys (has).forEach ((label) => {
            // issue a warning for each missing label
            if (!has[label]) {
                log.warn (`Docker service ${service.ID} is missing requisite label ${has}`);
            }
        });
        
        // all or nothing on the labels
        return false;
    },

    addServiceToDB: async (serviceOrID) => {
        var service = null;
        if (typeof serviceOrID == 'string') {
            service = await docker.getService (serviceOrID).inspect ();
        } else {
            service = serviceOrID;
        }

        log.debug (`Adding docker service ${service.ID} to database...`);

        const id = service.ID;
        const protocol = service.Spec.Labels[Config.serviceLabelPrefix + 'protocol'];
        const hostname = service.Spec.TaskTemplate.ContainerSpec.Hostname ? 
            service.Spec.TaskTemplate.ContainerSpec.Hostname : service.Spec.Name;
        const port = Number.parseInt (service.Spec.Labels[Config.serviceLabelPrefix + 'port'], 10);
        const domain = service.Spec.Labels[Config.serviceLabelPrefix + 'domain'];
        const auth = service.Spec.Labels[Config.serviceLabelPrefix + 'auth'] ?
            service.Spec.Labels[Config.serviceLabelPrefix + 'auth'] : null;

        const executionResult = await rqlite.dbExecute (`INSERT OR REPLACE INTO services (id, protocol, hostname, port, domain, auth)
        VALUES ('${id}', '${protocol}', '${hostname}', ${port}, '${domain}', '${auth}');`);

        log.debug (`Docker service ${service.ID} added to database in ${executionResult.time}.`);
    },

    removeServiceFromDB: async (serviceOrID) => {
        var id = null;
        if (typeof serviceOrID == 'object') {
            id = service.ID;
        } else {
            id = serviceOrID;
        }

        log.debug (`Removing docker service ${id} from database...`);
        const executionResult = await rqlite.dbExecute (`DELETE FROM services WHERE id = '${id}';`);
        log.debug (`Docker service ${id} removed from database in ${executionResult.time}.`);
    }
};