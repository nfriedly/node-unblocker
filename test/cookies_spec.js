var test = require('tap')
        .test,
    cookies = require('../lib/cookies');

        
test('should handle weird / invalid request urls without crashing', function(t) {
    var fakeRequest = {
        session: {}
        };
    var expected = '';
    var actual = cookies.get(fakeRequest,  {});
    t.equal(actual, expected);
    t.end();
});