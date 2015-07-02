var test = require('tap').test,
    getData = require('./test_utils.js').getData,
    cookies = require('../lib/cookies.js');

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
