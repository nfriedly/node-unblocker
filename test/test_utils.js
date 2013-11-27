var fork = require('child_process').fork,
    http = require('http');

exports.getServers = function(sourceContent, next) {
    var servers = {};
    servers.kill = function() {
        servers.remoteServer.close();
        servers.proxyServer.kill();
    }
    
    servers.remoteServer = http.createServer(function (req, res) {
        res.writeHead(200, {'content-type': 'text/html'});
        res.end(sourceContent);
    });

    servers.remoteServer.listen(8081, function () {
        servers.proxyServer = fork(__dirname + '/../proxy_worker.js', {silent: false});
        servers.proxyServer.once('message', function(msg) {
            next(null, servers);
        });
    });
}