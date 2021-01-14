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

const optRegEx = /opt(?:(?:ion)?s|ion)?/i;

function parseProxyOptions (labels) {
    const options = {};

    Object.keys (labels).forEach ((labelKey) => {
        // filter labels that start with the prefix
        if (labelKey.startsWith (Config.serviceLabelPrefix)) {
            const agassiLabel = labelKey.replace (Config.serviceLabelPrefix, '');
            // filter labels that define a proxy option
            if (optRegEx.test (agassiLabel)) {
                const optionKey = agassiLabel.substring (agassiLabel.lastIndexOf (Config.serviceLabelSeperator) + 1);
                // set the proxy options
                options[optionKey] = labels[labelKey];
            }
        }
    });

    return options;
}

module.exports = {
    API: docker,

    Events: dockerEvents,

    isAgassiService: (service) => {
        // determine which (if any) labels are missing
        const missingLabels = requisiteLabels.filter ((requisiteLabel) => {
            // check that some service label is set
            return Object.keys (service.Spec.Labels).some ((serviceLabel) => {
                return serviceLabel == Config.serviceLabelPrefix + requisiteLabel;
            });
        });

        // has all requisite labels, nothing to debug
        if (missingLabels.legnth == 0) {
            return true;
        }

        // has zero requisite labels, nothing to debug
        if (requisiteLabels.every (label => missingLabels.has (label))) {
            return false;
        }

        // if agassi.domain and agassi.opt.target are set, the service is fine
        const options = parseProxyOptions (service.Spec.Labels);
        if (!missingLabels.has ('domain') && (options.target || options.forward)) {
            return true;
        }


        // has some but not all requisite labels
        missingLabels.forEach ((label) => {
            // issue a warning for each missing label
            log.warn (`Docker service ${service.ID} is missing requisite label ${label}.`);
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
        // service and domain are strictly required
        swarmService.id = service.ID;
        swarmService.domain = service.Spec.Labels[Config.serviceLabelPrefix + 'domain'];

        swarmService.protocol = service.Spec.Labels[Config.serviceLabelPrefix + 'protocol'] ?
                                service.Spec.Labels[Config.serviceLabelPrefix + 'protocol'] : null;

        swarmService.hostname = service.Spec.TaskTemplate.ContainerSpec.Hostname ? 
                                service.Spec.TaskTemplate.ContainerSpec.Hostname : service.Spec.Name;
        // parse port in base 10
        swarmService.port =     service.Spec.Labels[Config.serviceLabelPrefix + 'port'] ?
                                Number.parseInt (service.Spec.Labels[Config.serviceLabelPrefix + 'port'], 10) : null;
                                
        swarmService.auth =     service.Spec.Labels[Config.serviceLabelPrefix + 'auth'] ?
                                service.Spec.Labels[Config.serviceLabelPrefix + 'auth'] : null;

        swarmService.options =  JSON.stringify (parseProxyOptions (service.Spec.Labels));

        // check if service exists in database already
        const queryResult = await rqlite.dbQuery (`SELECT * FROM services WHERE id = '${service.ID}';`, 'strong');

        if (!(queryResult.values.length > 0)) {
            log.debug (`Service ${service.ID} does not exist in database, adding it...`);
            // service does not already exist, insert it
            const executionResult = await rqlite.dbExecute (`INSERT INTO services 
                (id, domain, protocol, hostname, port, auth, options)
                VALUES (
                    '${swarmService.id}', 
                    '${swarmService.domain}',
                    ${swarmService.protocol}, 
                    ${swarmService.hostname}, 
                    ${swarmService.port},  
                    ${swarmService.auth},
                    ${swarmService.options});`);

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
                    updateQuery += `${key} = ${swarmService[key]} `;
                });
                updateQuery += `WHERE id = '${swarmService.id}';`;

                const updateResults = await rqlite.dbExecute (updateQuery);
                log.debug (`Updated ${diffKeys.length} records for service ${service.ID} in ${updateResults.time}.`);
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