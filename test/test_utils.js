var fork = require('child_process').fork,
    http = require('http');

exports.getServers = function(sourceContent, cluster, next) {
    if (typeof cluster == 'function') {
        next = cluster;
        cluster = false;
    }
    var servers = {};
    servers.kill = function(next) {
        servers.remoteServer.close(function() {
            servers.remoteServer.off = true;
            if (servers.proxyServer.off) {
                next && next();
            }
        });
        servers.proxyServer.on('close', function() {
            servers.proxyServer.off = true;
            if (servers.remoteServer.off) {
                next && next();
            }
        });
        servers.proxyServer.kill();
    }
    
    servers.remoteServer = http.createServer(function (req, res) {
        res.writeHead(200, {'content-type': 'text/html'});
        res.end(sourceContent);
    });

    servers.remoteServer.listen(8081, function () {
        var file = cluster ? 'server.js' : 'proxy_worker.js';
        servers.proxyServer = fork(__dirname + '/../' + file, {silent: false});
        servers.proxyServer.once('message', function(msg) {
            next(null, servers);
        });
    });
}