var fs = require('fs'),
    concat = require('concat-stream'),
    test = require('tap').test,
    hyperquest = require('hyperquest'),
    getServers = require('./test_utils.js').getServers;
    
var source = fs.readFileSync(__dirname + '/source/index.html');
var expected = fs.readFileSync(__dirname + '/expected/index.html');

test("url_rewriting should support support all kinds of links", function(t) {
    getServers(source, function(err, servers) {
        function cleanup() {
            servers.kill(function() {
                t.end();
            });
        }
        hyperquest('http://localhost:'+ servers.proxyServer.port + '/proxy/http://localhost:8081/')
            .pipe(concat(function(data) {
                t.equal(data.toString(), expected.toString().replace(/<proxyPort>/g, servers.proxyServer.port));
                cleanup();
            }))
            .on('error', function(err) {
                console.error('error retrieving data from proxy', err);
                cleanup();
            });
    });
})


test("clustering should not break url rewriting", function(t) {
    getServers(source, true, function(err, servers) {
        function cleanup() {
            servers.kill(function() {
                t.end();
            });
        }
        hyperquest('http://localhost:'+ servers.proxyServer.port + '/proxy/http://localhost:8081/')
            .pipe(concat(function(data) {
                t.equal(data.toString(), expected.toString().replace(/<proxyPort>/g, servers.proxyServer.port));
                cleanup();
            }))
            .on('error', function(err) {
                console.error('error retrieving data from proxy', err);
                cleanup();
            });
    });
})