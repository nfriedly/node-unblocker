var test = require('tap').test;

var googleAnalytics = require('../lib/googleanalyticsstream');

var html = '<html><head><title>test</title><body><p>asdf</p></body></html>';

test("should do nothing when there is no ID set", function(t) {
    var expected = html;
    var actual = googleAnalytics.addGa(html);
    t.equal(actual, expected);
    t.end();
});

test("should add google analytics snippet when there is an ID", function(t) {
    var expected = html;
    googleAnalytics.setId('asdf');
    var actual = googleAnalytics.addGa(html);
    t.notEqual(actual, expected);
    t.end();
});
