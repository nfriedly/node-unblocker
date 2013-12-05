var http = require('http'),
    async = require('async'),
    app = require('../app');

exports.getServers = function(sourceContent, cluster, next) {
    if (typeof cluster == 'function') {
        next = cluster;
        cluster = false;
    }

    function sendContent(req, res) {
        res.writeHead(200, {
            'content-type': 'text/html'
        });
        res.end(sourceContent);
    }

    var proxyServer = http.createServer(app),
        remoteServer = http.createServer(sendContent);

    proxyServer.setTimeout(5000);
    remoteServer.setTimeout(5000);

    async.parallel([
        proxyServer.listen.bind(proxyServer, 8080),
        remoteServer.listen.bind(remoteServer, 8081)
    ], function(err) {
        next(err, {
            proxyServer: proxyServer,
            remoteServer: remoteServer,
            kill: function(next) {
                async.parallel([
                    remoteServer.close.bind(remoteServer),
                    proxyServer.close.bind(proxyServer),
                ], next);
            }
        });
    });
};
