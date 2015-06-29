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


// local dependencies
var unblocker = require('./lib/unblocker.js');


function getApp(withRedis) {
    withRedis = (withRedis !== false); // default to true for null/undefined


    var app = express();

    var unblockerConfig = {
        // just "site.com" or "site.com:port", no "http://"
        // this is used in redirects
        host: null,
        // prefix proxy urls with this path. This is also a good point to mount your homepage
        basePath: '/proxy',
        homepage: '/', // putting the homepage at / is not recommended because it makes the proxy more likely to incorrectly process a request
        responseMiddleware: [
            // middleware can be any object with a createStream(remoteResponseHeaders){} function
            unblocker.metaRobots
        ]
    };

    var google_analytics_id = process.env.GA_ID || null;
    if (google_analytics_id) {
        unblockerConfig.middleware.push(require('./lib/googleanalyticsstream.js')(google_analytics_id));
    }


    // serve up static files at /proxy (or whatever basePath is set to
    app.use(unblockerConfig.homepage, express.static(__dirname + '/public'));

    // this is for users who's form actually submitted due to JS being disabled or whatever
    app.get("/proxy/no-js", function(req, res) {
        // grab the "url" parameter from the querystring
        var site = querystring.parse(url.parse(req.url).query).url;
        // and redirect the user to /proxy/url
        res.redirect(unblockerConfig.basePath + '/' + site);
    });


    // GET, POST, etc to any URL that we don't already have a path configured for
    app.all('*', unblocker(unblockerConfig));

    if (withRedis) {

        var session = require('express-session');
        var RedisStore = require('connect-redis')(session);
        var redis;

        // the redis client differs depending on if you're using redistogo (heroku) or not
        if (process.env.REDISTOGO_URL) {
            // config for redis if you're on heroku or using redis-to-go
            redis = require('redis-url').connect(process.env.REDISTOGO_URL);
        } else {
            // config for redis if you're running your own copy
            var redis_host = "localhost",
                redis_port = 6379,
                redis_options = null;
            redis = require('redis').createClient(redis_port, redis_host, redis_options);
        }
        redis.unref();

        app.use(session({
            store: new RedisStore({
                client: redis
            }),
            // this is used to keep session cookies secure. You should change this.
            secret: process.env.SECRET || "correct horse battery staple",
            resave: false,
            saveUninitialized: false
        }));
    }

    return app;
}

var app;
// for compatibility with gatlin
module.exports = function(req, res) {
    if (!app) app = getApp();
    app(req, res);
};

// for testing
module.exports.getApp = getApp;