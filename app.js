/***************
 * node-unblocker: Web Proxy for evading firewalls and content filters,
 * similar to CGIProxy or PHProxy
 *
 *
 * This project is hosted on github:  https://github.com/nfriedly/node-unblocker
 *
 * By Nathan Friedly - http://nfriedly.com
 * Released under the terms of the GPL v3
 */

var url = require('url'),
    querystring = require('querystring');

var express = require('express');

require('dotenv').load({
    silent: true
}); //loads "environment" properties from git-ignore'd .env file


var unblocker = require('./lib/unblocker.js');

var app = express();

var unblockerConfig = {
    // just "site.com" or "site.com:port", no "http://"
    // this is used in redirects
    host: null,
    // prefix proxy urls with this path. This is also a good point to mount your homepage
    prefix: '/proxy/',
    homepage: '/', // putting the homepage at / is not recommended because it makes the proxy more likely to incorrectly process a request
    responseMiddleware  : [
        // middleware looks like function(data, next) { /* doStuff(); */ next(); }
    ]
};

var google_analytics_id = process.env.GA_ID || null;
if (google_analytics_id) {
    unblockerConfig.middleware.push(require('./lib/googleanalyticsstream.js')(google_analytics_id));
}

// this line must appear before any express.static calls (or anything else that sends responses
app.use(unblocker(unblockerConfig));

// serve up static files at /proxy (or whatever basePath is set to
app.use(unblockerConfig.homepage, express.static(__dirname + '/public'));

// this is for users who's form actually submitted due to JS being disabled or whatever
app.get(unblockerConfig.homepage + "no-js", function(req, res) {
    // grab the "url" parameter from the querystring
    var site = querystring.parse(url.parse(req.url).query).url;
    // and redirect the user to /proxy/url
    res.redirect(unblockerConfig.basePath + '/' + site);
});


// for compatibility with gatlin
module.exports = app;

// for testing
module.exports.getApp = getApp;
