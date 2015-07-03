var test = require('tap').test,
    utils = require('./test_utils.js'),
    getData = utils.getData,
    cookies = require('../lib/cookies.js'),
    PassThrough = require('stream').PassThrough,
    concat = require('concat-stream');

test('should rewrite set-cookie paths', function(t) {
    var instance = cookies({prefix: '/proxy/', processContentTypes: []});
    var data = getData();
    data.headers['set-cookie'] = ['one=1', 'two=2; path=/', 'three=3; path=/foo'];
    instance.handleResponse(data);
    var expected = [
        'one=1; Path=/proxy/http://example.com/',
        'two=2; Path=/proxy/http://example.com/',
        'three=3; Path=/proxy/http://example.com/foo'];
    var actual = data.headers['set-cookie'];
    t.same(actual, expected);
    t.end();
});


test('should rewrite urls that change subdomain or protocol (but not domain)', function(t) {
    var instance = cookies({prefix: '/proxy/', processContentTypes: ['text/html']});
    var data = getData();
    var sourceStream = new PassThrough({
        encoding: 'utf8'
    });
    data.stream = sourceStream;
    instance.handleResponse(data);
    t.notEqual(data.stream, sourceStream, "cookies.handleResponse should create a new stream to process content");
    var source = [
        '<a href="/proxy/http://example.com/">no change</a>',
        '<a href="/proxy/https://example.com/">new proto</a>',
        '<a href="/proxy/http://sub.example.com/">new subdomain</a>',
        '<a href="/proxy/http://othersite.com/">other site, same proto</a>',
        '<a href="/proxy/https://othersite.com/">other site, dif proto</a>',
        '<img src="/proxy/http://example.com/img.jpg" alt="no change" />',
        '<img src="/proxy/https://example.com/img.jpg" alt="new proto">'
    ].join('\n');

    var expected = [
        '<a href="/proxy/http://example.com/">no change</a>',
        '<a href="/proxy/http://example.com/?__proxy_cookies_to=https%3A%2F%2Fexample.com%2F">new proto</a>',
        '<a href="/proxy/http://example.com/?__proxy_cookies_to=http%3A%2F%2Fsub.example.com%2F">new subdomain</a>',
        '<a href="/proxy/http://othersite.com/">other site, same proto</a>',
        '<a href="/proxy/https://othersite.com/">other site, dif proto</a>',
        '<img src="/proxy/http://example.com/img.jpg" alt="no change" />',
        '<img src="/proxy/http://example.com/img.jpg?__proxy_cookies_to=https%3A%2F%2Fexample.com%2Fimg.jpg" alt="new proto">'
    ].join('\n');

    data.stream.pipe(concat(function(actual) {
        t.equal(actual, expected);
        t.end();
    }));

    sourceStream.end(source);
});

