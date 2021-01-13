"use strict";

const log = require ('./logger.js');
const Config = require ('./config.js');

const Docker = require ('dockerode');
const DockerEvents = require ('docker-events');

const rqlite = require ('./rqlite/rqlite.js');

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
                log.warn (`Docker service ${service.ID} is missing requisite label ${has}.`);
            }
        });
        
        // all or nothing on the labels
        return false;
    },

    pushServiceToDB: async (serviceOrID) => {
        var service = null;
        if (typeof serviceOrID == 'string') {
            service = await docker.getService (serviceOrID).inspect ();
        } else {
            service = serviceOrID;
        }

        // parse variables from service
        const swarmService = {};
        swarmService.id = service.ID;
        swarmService.protocol = service.Spec.Labels[Config.serviceLabelPrefix + 'protocol'];
        swarmService.hostname = service.Spec.TaskTemplate.ContainerSpec.Hostname ? 
                                service.Spec.TaskTemplate.ContainerSpec.Hostname : service.Spec.Name;
        swarmService.port = Number.parseInt (service.Spec.Labels[Config.serviceLabelPrefix + 'port'], 10); // base 10
        swarmService.domain = service.Spec.Labels[Config.serviceLabelPrefix + 'domain'];
        swarmService.auth = service.Spec.Labels[Config.serviceLabelPrefix + 'auth'] ?
            service.Spec.Labels[Config.serviceLabelPrefix + 'auth'] : null;

        // check if service exists in database already
        const queryResult = await rqlite.dbQuery (`SELECT * FROM services WHERE id = '${service.ID}';`, 'strong');

        if (!(queryResult.values.length > 0)) {
            log.debug (`Service ${service.ID} does not exist in database, adding it...`);
            // service does not already exist, insert it
            const executionResult = await rqlite.dbExecute (`INSERT INTO services 
                (id, protocol, hostname, port, domain, auth)
                VALUES (
                    '${swarmService.id}', 
                    '${swarmService.protocol}', 
                    '${swarmService.hostname}', 
                    ${swarmService.port}, 
                    '${swarmService.domain}', 
                    '${swarmService.auth}');`);

            log.debug (`Added service ${service.ID} in ${executionResult.time}.`);
        } else {
            // service exists, may need to be updated
            const dbService = queryResult.values[0];
            // get which keys in each service (if any) are different
            const diffKeys = Object.keys (swarmService).filter (key => {
                return swarmService[key] !== dbService[key];
            });

            if (diffKeys.length > 0) {
                log.debug (`Updating service ${service.ID} in database...`);
                // services do not match, update differing keys
                const updateQuery = 'UPDATE services SET ';
                diffKeys.forEach (key => {
                    updateQuery += `${key} = '${swarmService[key]}' `;
                });
                updateQuery += `WHERE id = '${swarmService.id}';`;

                const updateResults = await rqlite.dbExecute (updateQuery);
                log.debug (`Updated ${diffKeys.length} for service ${service.ID} in ${updateResults.time}.`);
            } else {
                // services match, nothing to do
                log.debug (`Service ${service.ID} already exists in database.`);
            }
        }
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