//*
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
                if (next) next();
            }
        });
        servers.proxyServer.on('close', function() {
            servers.proxyServer.off = true;
            if (servers.remoteServer.off) {
                if (next) next();
            }
        });
        servers.proxyServer.kill();
    };

    servers.remoteServer = http.createServer(function(req, res) {
        res.writeHead(200, {
            'content-type': 'text/html'
        });
        res.end(sourceContent);
    });

    servers.remoteServer.listen(8081, function() {
        //var file = cluster ? 'server.js' : 'app.js';
        servers.proxyServer = fork(__dirname + '/../server.js');
        servers.proxyServer.once('message', function( /*msg*/ ) {
            next(null, servers);
        });
    });
};

// */

/* 

// This should work but something in the app leaves the system hanging

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
                remoteServer.close(console.log.bind(console, 'remote closed'));
                proxyServer.close(console.log.bind(console, 'proxy closed'));
                remoteServer.unref()
                proxyServer.unref()
                next && next(); // todo: make this wait on the close events
            }
        });
    });
};

// */
