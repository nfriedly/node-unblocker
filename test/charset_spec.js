/*
 test/expected/charset-iso-2022-jp-to-utf-8.html
 test/expected/charset-windows-latin-1-to-utf-8.html
 test/source/charset-iso-2022-jp.html
 test/source/charset-windows-latin-1.html
 */

var test = require('tap').test;
var fs = require('fs');
var crypto = require('crypto');
var http = require('http');
var concat = require('concat-stream');
var getServers = require('./test_utils.js').getServers;


// source is http://qa-dev.w3.org/wmvs/HEAD/dev/tests/xhtml-windows-1250.xhtml which is linked to from http://validator.w3.org/dev/tests/#encoding
var source = fs.readFileSync(__dirname + '/source/xhtml-windows-1250.xhtml');
var expected =  fs.readFileSync(__dirname + '/expected/xhtml-windows-1250.xhtml');

// first validate that the IDE or whatever didn't change the file encoding
var SOURCE_HASH = '11f694099b205b26a19648ab22602b39c6deb125';
var EXPECTED_HASH = 'e4cd45940d01670eeee49e7ce99adf39a7ccac60';
test("source and expected xhtml-windows-1250.xhtml files should not have changed", function(t) {
    t.equal(crypto.createHash('sha1').update(source).digest('hex'), SOURCE_HASH);
    t.equal(crypto.createHash('sha1').update(expected).digest('hex'), EXPECTED_HASH);
    t.end();
});

test("should properly decode, update, and re-encode non-native charsets", function(t){
    t.plan(1);
    getServers(source, 'windows-1250', function(err, servers) {
        http.get("http://localhost:8080/proxy/http://localhost:8081/", function(res) {
            res.pipe(concat(function(actual) {
                servers.kill();
                t.same(actual, expected);
            }));
        }).on('error', function(e) {
            t.bailout(e);
        });
    });
});




