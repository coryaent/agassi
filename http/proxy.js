"use strict";

const httpProxy = require ('http-proxy');

// create proxy server
module.exports = httpProxy.createProxyServer({
    secure: false,
    followRedirects: true,
})
.on ('proxyReq', (proxyRequest, request) => {
    if (request.host != null) {
        proxyRequest.setHeader ('Host', request.host);
    };
})
.on ('error', (error) => {
    print (error.name);
    print (error.message);
    process.exitCode = 1;
});