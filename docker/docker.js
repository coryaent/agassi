"use strict";

const log = require ('./logger.js');
const Config = require ('./config.js');

const Docker = require ('dockerode');
const DockerEvents = require ('docker-events');

const rqlite = require ('./rqlite/rqlite.js');

const docker = new Docker (parseSocket (process.env.DOCKER_SOCKET_URL));
const dockerEvents = new DockerEvents ({docker: docker});

// parse docker socket host, dropping protocol per
// https://github.com/apocas/docker-modem/issues/31#issuecomment-68103138
function parseSocket (_dockerSocketURL) {
    const dockerSocketURL = new URL (_dockerSocketURL);
    if (dockerSocketURL.protocol.startsWith ('unix') || 
        dockerSocketURL.protocol.startsWith ('file')) {
        return {
            socketPath: dockerSocketURL.pathname
        };
    } else {
        return {
            host: dockerSocketURL.hostname,
            port: dockerSocketURL.port
        };
    }
}


module.exports = {
    API: docker,

    Events: dockerEvents,

    pushServiceToDB: async (serviceOrID) => {
        var service = null;
        if (typeof serviceOrID == 'string') {
            service = await docker.getService (serviceOrID).inspect ();
        } else {
            service = serviceOrID;
        }

        const labels = parseServiceLabels (service);

        // parse variables from service
        const swarmService = {};
        // service and domain are strictly required
        swarmService.id =       service.ID;
        swarmService.domain =   labels[Config.serviceLabelPrefix + 'domain'];

        swarmService.protocol = labels[Config.serviceLabelPrefix + 'protocol'] ?
                                labels[Config.serviceLabelPrefix + 'protocol'] : null;

        swarmService.hostname = service.Spec.TaskTemplate.ContainerSpec.Hostname ? 
                                service.Spec.TaskTemplate.ContainerSpec.Hostname : service.Spec.Name;
        // parse port in base 10
        swarmService.port =     labels[Config.serviceLabelPrefix + 'port'] ?
                                Number.parseInt (labels[Config.serviceLabelPrefix + 'port'], 10) : null;
                                
        swarmService.auth =     labels[Config.serviceLabelPrefix + 'auth'] ?
                                labels[Config.serviceLabelPrefix + 'auth'] : null;

        swarmService.options =  JSON.stringify (parseProxyOptions (labels));

        // check if service exists in database already
        log.debug (`Checking database for service ${service.ID}...`);
        const queryResult = await rqlite.dbQuery (`SELECT * FROM services WHERE id = '${service.ID}';`, 'strong');

        if (!(queryResult.results.length > 0)) {
            log.debug (`Service ${service.ID} does not exist in database, adding it...`);
            // service does not already exist, insert it
            const executionResult = await rqlite.dbExecute (`INSERT INTO services 
                (id, domain, protocol, hostname, port, auth, options)
                VALUES (
                    '${swarmService.id}', 
                    '${swarmService.domain}',
                    '${swarmService.protocol}', 
                    '${swarmService.hostname}', 
                    '${swarmService.port}',  
                    '${swarmService.auth}',
                    '${swarmService.options}');`);

            log.debug (`Added service ${service.ID} in ${executionResult.time * 1000} ms.`);
        } else {
            // service exists, may need to be updated
            const dbService = queryResult.results[0];
            // get which keys in each service (if any) are different
            const diffKeys = Object.keys (swarmService).filter (key => {
                return swarmService[key] !== dbService[key];
            });

            if (diffKeys.length > 0) {
                log.debug (`Updating service ${service.ID} in database...`);
                // services do not match, update differing keys
                let updateQuery = 'UPDATE services SET ';
                diffKeys.forEach (key => {
                    updateQuery += `${key} = '${swarmService[key]}' `;
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