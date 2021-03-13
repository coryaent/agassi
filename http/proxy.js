"use strict";

const httpProxy = require ('http-proxy');
const log = require ('../logger.js');

// create proxy server
module.exports = httpProxy.createProxyServer ({
    // default options
    secure: false,
    followRedirects: true,
})
.on ('proxyReq', (proxyRequest, request) => {
    // rewrite headers
    if (request.host != null) {
        proxyRequest.setHeader ('Host', request.host);
    };
})
.on ('error', (error) => {
    log.warn (error.name);
    log.warn (error.message);
    process.exitCode = 1;
});