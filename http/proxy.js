"use strict";

const httpProxy = require ('http-proxy');

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
    process.exitCode = 1;
    throw error;
});