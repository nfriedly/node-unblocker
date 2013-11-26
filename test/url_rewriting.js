var fs = require('fs'),
    http = require('http'),
    fork = require('child_process').fork,
    concat = require('concat-stream'),
    test = require('tap').test,
    hyperquest = require('hyperquest');
    
var source = fs.readFileSync(__dirname + '/source/index.html');
var expected = fs.readFileSync(__dirname + '/expected/index.html');
var re_split_lines = /[\r\n]+/i;

var remoteServer = http.createServer(function (req, res) {
    res.writeHead(200, {'content-type': 'text/html'});
    res.end(source);
});

function compareLines(t, expectedText, actualText) {
    var actualLines = actualText.toString().trim().split(re_split_lines);
    var expectedLines = expectedText.toString().trim().split(re_split_lines);
    console.log('actual', actualLines.length, actualLines);
    console.log('expected', expectedLines.length, expectedLines);
    return;
    expectedLines.forEach(function(expectedLine, i) {
        var actualLine = actualLines[i];
        t.equal(actualLine, expectedLine); //, "context: " + expectedLines.slice(Math.min(Math.abs(i-2), 0),i+2).join('\n'));
    });
}

test("url_rewriting should support support all kinds of links", function(t) {
    remoteServer.listen(8081, function () {
        var proxyServer = fork(__dirname + '/../proxy_worker.js', {silent: true});
        proxyServer.once('message', function(msg) {
            function cleanup() {
                proxyServer.kill();
                remoteServer.close()
                t.end();
            }
            hyperquest("http://localhost:8080/proxy/http://localhost:8081/")
                .pipe(concat(function(data) {
                    t.equal(data.toString(), expected.toString());
                    cleanup();
                }))
                .on('response', function(data) {
                    console.log('response data: ', data);
                })
                .on('error', function(err) {
                    console.error('error retrieving data from proxy', err);
                    cleanup();
                });
        });
    });
})
