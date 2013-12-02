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

/*
todo:
 - stress test (apache bench?)
 - add error handeling
 - look into npm
 - mini-form, no cookies,  and no script options
 - figure out why the google png has extra data at the beginning and end
 - clean things up a bit
 - turn simple-session into a standalone library
*/

// native imports
var http = require('http'),
    https = require('https'),
    url = require('url'),
    querystring = require('querystring'),
    path = require("path"),
    fs = require("fs"),
    zlib = require('zlib');

// for great performance!
// kind of hard to see much difference in local testing, but I think this should make an appreciable improvement in production
// https://github.com/substack/hyperquest#rant
http.globalAgent.maxSockets = 64;
https.globalAgent.maxSockets = 64;

// local dependencies
var googleAnalytics = require('./lib/googleanalyticsstream'),
    blocklist = require('./lib/blocklist'),
    serveStatic = require('./lib/static'),
    proxy = require('./lib/proxy');

// the configuration file
var config = require('./config');

googleAnalytics.setId(config.google_analytics_id);
serveStatic.setGa(googleAnalytics);

// third-party dependencies
var connect = require('connect'), // todo: call by version once 2.x is listed in npm
    RedisStore = require('connect-redis')(connect),
    redis;
// the redis client differs depending on if you're using redistogo (heroku) or not
if (config.redistogo_url) {
    redis = require('redis-url')
        .connect(config.redistogo_url);
} else {
    redis = require('redis')
        .createClient(config.redis_port, config.redis_host, config.redis_options);
}

var server = connect()
    .use(connect.cookieParser(config.secret))
    .use(connect.session({
        store: new RedisStore({
            client: redis
        }),
        cookie: {
            path: '/',
            httpOnly: false,
            maxAge: null
        }
    }))
    .use(function(request, response) {
        var url_data = url.parse(request.url);

        //console.log("(" + process.pid + ") New Request: ", request.url);


        incrementRequests();
        request.on('end', decrementRequests);
        
        // convenience methods 
        request.thisHost = thisHost.bind(thisHost, request);
        request.thisSite = thisSite.bind(thisSite, request);
        request.redirectTo = redirectTo.bind(redirectTo, request, response);

        // if the user requested the "home" page
        // (located at /proxy so that we can more easily tell the difference 
        // between a user who is looking for the home page and a "/" link)
        if (url_data.pathname == "/proxy") {
            request.url = "/index.html";
            return serveStatic(request, response);
        }
        // disallow almost everything via robots.txt
        if (url_data.pathname == "/robots.txt") {
            return serveStatic(request, response);
        }

        // this is for users who's form actually submitted due to JS being disabled
        if (url_data.pathname == "/proxy/no-js") {
            // grab the "url" parameter from the querystring
            var site = querystring.parse(url.parse(request.url)
                .query)
                .url;
            // and redirect the user to /proxy/url
            request.redirectTo(site || "");
        }

        // only requests that start with this get proxied - the rest get 
        // redirected to either a url that matches this or the home page
        if (url_data.pathname.indexOf("/proxy/http") == 0) {
        
            var uri = url.parse(proxy.getRealUrl(request.url));
            // make sure the url in't blocked
            if (!blocklist.urlAllowed(uri)) {
                return request.redirectTo("?error=Please use a different proxy to access this site");
            }

            return proxy(uri, request, response);
        }

        // the status page
        if (url_data.pathname == "/proxy/status") {
            return status(request, response);
        }

        // any other url gets redirected to the correct proxied url if we can
        // determine it based on their referrer, or the home page otherwise
        return handleUnknown(request, response);

    }); // we'll start the server at the bottom of the file




/**
 * This is what makes this server magic: if we get an unrecognized request that wasn't corrected by
 * proxy's filter, this checks the referrer to determine what the path should be, and then issues a
 * 302 redirect to a proxied url at that path
 *
 * todo: handle querystring and post data
 */
function handleUnknown(request, response) {

    if (request.url.indexOf('/proxy/') == 0) {
        // no trailing slashes
        if (request.url == "/proxy/") {
            return request.redirectTo("");
        }

        // we already know it doesn't start with http, so lets fix that first
        // "/proxy/".length = 7
        return request.redirectTo( "/http://" + request.url.substr(7));
    }

    // if there is no referer, then either they just got here or we can't help them
    if (!request.headers.referer) {
        return request.redirectTo(""); // "" because we don't want a trailing slash
    }

    var ref = url.parse(request.headers.referer);

    // if we couldn't parse the referrer or they came from another site, they send them to the home page
    if (!ref || ref.host != thisHost(request)) {
        return request.redirectTo(""); // "" because we don't want a trailing slash
    }

    // now we know where they came from, so we can do something for them
    if (ref.pathname.indexOf('/proxy/http') == 0) {
        var real_url = url.parse(proxy.getRealUrl(ref.pathname));

        // now, take the requested pat on the previous known host and send the user on their way
        return request.redirectTo(real_url.protocol + "//" + real_url.host + request.url);
    }

    // else they were refered by something on this site that wasn't the home page and didn't come 
    // through the proxy - aka this shouldn't happen
    request.redirectTo("");
}

// returns the configured host if one exists, otherwise the host that the current request came in on
function thisHost(request) {
    if (config.host) {
        return config.host;
    }
    if (request.headers.host == 'localhost') {
        request.headers.host + config.port; // special case to make testing & development easier
    } else {
        return request.headers.host; // normal case: include the hostname but assume we're either on a standard port or behind a reverse proxy
    }
}

// returns the http://site.com/proxy
function thisSite(request) {
    return 'http://' + thisHost(request) + '/proxy';
}

function redirectTo(request, response, site) {
    site = site || "";
    if (site.length && site.substr(0, 1) != "/" && site.substr(0, 1) != "?") {
        site = "/" + site;
    }
    if (site.substr(0, 6) == "/proxy") { // no /proxy/proxy redirects
        site = site.substr(6);
    }
    if (site == "/") site = ""; // no endless redirect loops
    try {
        response.writeHead(307, {
            'Location': thisSite(request) + site
        });
        //console.log("recirecting to " + thisSite(request) + site);
    } catch (ex) {
        // the headers were already sent - we can't redirect them
        console.error("Failed to send redirect", ex);
    }
    response.end();
}

function incrementRequests() {
    process.send({
        type: "request.start"
    });
}

function decrementRequests() {
    process.send({
        type: "request.end"
    });
}

var waitingStatusResponses = [];

// simple way to get the curent status of the server
function status(request, response) {
    //console.log("status request recieved on pid " + process.pid);
    response.writeHead("200", {
        "Content-Type": "text/plain",
        "Expires": 0
    });

    // only send out a new status request if we don't already have one in the pipe
    if (waitingStatusResponses.length == 0) {
        //console.log("sending status request message");
        process.send({
            type: "status.request",
            from: process.pid
        });
    }

    // 1 second timeout in case the master doesn't respond quickly enough
    response.timeout = setTimeout(function() {
        //console.log("Error: status responses timeout reached");
        sendStatus({
            error: "No response from the cluster master after 1 second"
        });
    }, 1000);

    waitingStatusResponses.push(response);
}

function sendStatus(status) {
    var big_break = "====================";
    var small_break = "--------------------";
    var lines = [
        "Server Status",
        big_break, (new Date())
        .toString(),
        "",
        "Cluster Status",
        small_break
    ];

    for (key in status) {
        if (status.hasOwnProperty(key)) {
            if (key == "type" || key == "to") {
                continue;
            }
            var val = status[key];
            lines.push(key + ": " + val);
        }
    }

    var body = lines.join("\n");

    waitingStatusResponses.forEach(function(response) {
        response.end(body);
        clearTimeout(response.timeout);
    });

    waitingStatusResponses.length = 0;
};

/**
 * Set up the server (assumes it's a child in a cluster)
 */
http.Server(server)
    .listen(config.port, config.ip, function() {
        // this is to let the integration tests know when it's safe to run
        process.send({
            type: 'ready'
        });
        console.log('node-unblocker proxy server with pid ' + process.pid + ' running on ' +
            ((config.ip) ? config.ip + ":" : "port ") + config.port
        );
    });

process.on('message', function(message) {
    if (!message.type) {
        return;
    }
    //console.log("messge recieved by child (" + process.pid + ") ", message);
    if (message.type == "status.response") {
        sendStatus(message);
    }
});
