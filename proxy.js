"use strict";

const httpProxy = require ('http-proxy');

// create proxy server
module.exports.default = httpProxy.createProxyServer({
    secure: false,
    followRedirects: true,
})
.on ('proxyReq', (proxyRequest, request) => {
    if (request.host != null) {
        proxyRequest.setHeader ('host', request.host);
    };
})
.on ('error', (error) => {
    print (error.name);
    print (error.message);
    process.exitCode = 1;
});