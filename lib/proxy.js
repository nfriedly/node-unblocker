var URL = require('url'),
    http = require('http'),
    https = require('https'),
    async = require('async'),
    _ = require('lodash'),
    contentTypes = require('./content-types.js');


function proxy(config) {

    /**
     * Makes the outgoing request and relays it to the client, modifying it along the way if necessary
     */
    function proxyRequest(data, next) {

        delete data.headers.host;  // I think node.js's http.get automatically restores this to the correct value

        async.applyEachSeries(config.requestMiddleware, data, function(err) {
            if (err) {
                return next(err);
            }

            var uri = URL.parse(data.url);

            var options = {
                host: uri.hostname,
                port: uri.port,
                path: uri.pathname,
                method: data.clientRequest.method,
                headers: data.headers
            };

            // what protocol to use for outgoing connections.
            var proto = (uri.protocol == 'https:') ? https : http;

            data.remoteRequest = proto.request(options, function(remoteResponse) {
                data.remoteResponse = remoteResponse;
                proxyResponse(data, next);
            });

            //data.remoteRequest.addListener('error', next);

            // pass along POST data & let the remote server know when we're done sending data
            data.stream.pipe(data.remoteRequest);
        });
    }

    function proxyResponse(data, next) {
        data.remoteResponse.pause();
        data.remoteResponse.on('end', function() {
            data.remoteResponse.ended = true;
        });

        // make a copy of the headers to fiddle with
        data.headers = _.cloneDeep(data.remoteResponse.headers);

        data.stream = data.remoteResponse;

        data.contentType = contentTypes.getType(data);

        async.applyEachSeries(config.responseMiddleware, data, function(err) {
            if (err) {
                return next(err);
            }
            //  fire off out (possibly modified) headers
            data.clientResponse.writeHead(data.remoteResponse.statusCode, data.headers);
        });

    }

    return proxyRequest;
}

module.exports = proxy;
