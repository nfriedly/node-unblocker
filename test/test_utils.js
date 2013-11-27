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
        // travis CI seems to have a conflict when two tests in a row both use port 8080, even if the first test waits for the previous one to close
        var proxyPort = Math.round(Math.random() * (65535-1024) + 1024);
        servers.proxyServer = fork(__dirname + '/../' + file, {
            silent: false,
            env: { PORT: proxyPort }
        });
        servers.proxyServer.port = proxyPort;
        servers.proxyServer.once('message', function(msg) {
            next(null, servers);
        });
    });
}