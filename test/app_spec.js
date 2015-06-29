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
        console.log(servers.proxiedUrl);
        hyperquest(servers.proxiedUrl)
            .pipe(concat(function(data) {
                t.equal(data.toString(), expected.toString().replace(/<remotePort>/g, servers.remotePort));
                cleanup();
            }))
            .on('error', function(err) {
                console.error('error retrieving data from proxy', err);
                cleanup();
            });
    });
});


test("should serve robots.txt when requested", function(t) {
    var expected = fs.readFileSync(__dirname + '/../public/robots.txt');
    getServers(source, function(err, servers) {
        function cleanup() {
            servers.kill(function() {
                t.end();
            });
        }
        hyperquest(servers.homeUrl + "robots.txt")
            .pipe(concat(function(data) {
                t.equal(data.toString(), expected.toString().replace(/<remotePort>/g, servers.remotePort));
                cleanup();
            }))
            .on('error', function(err) {
                console.error('error retrieving robots.txt from proxy', err);
                cleanup();
            });
    });
});
