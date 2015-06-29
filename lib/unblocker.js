var url = require('url');
var proxy = require('./proxy');
var _ = require('underscore');


// add a little bit of middleware that we want avaliable but don't want to automatically include
Unblocker.metaRobots = require('./metarobotsstream.js');


function Unblocker(config) {
    _.defaults(config, {
        basePath: '/proxy',
        homePage: '/',
        responseMiddleware: []
    });

    var prefix = config.basePath.substr(-1) == '/' ? config.basePath : config.basePath + '/';

    config.prefix = prefix;

    proxy.setConfig(config);

    return handleRequest;

    // function definitions

    function handleRequest(request, response) {

        // convenience methods
        request.thisHost = thisHost.bind(thisHost, request);
        request.thisSite = thisSite.bind(thisSite, request);
        response.redirectTo = redirectTo.bind(redirectTo, request, response);

        var url_data = url.parse(request.url);

        // only requests that start with this get proxied - the rest get
        // redirected to either a url that matches this or the home page
        if (url_data.pathname.indexOf(prefix + "http") === 0) {
            var uri = url.parse(proxy.getRealUrl(request.url));
            return proxy(uri, request, response);
        }

        // any other url gets redirected to the correct proxied url if we can
        // determine it based on their referrer, or the home page otherwise
        return handleUnknown(request, response);
    }

    /**
     * This is what makes this server magic: if we get an unrecognized request that wasn't corrected by
     * proxy's filter, this checks the referrer to determine what the path should be, and then issues a
     * 302 redirect to a proxied url at that path
     *
     * todo: handle querystring and post data
     */
    function handleUnknown(request, response) {

        if (request.url.indexOf(prefix) === 0) {
            // no trailing slashes
            if (request.url == prefix) {
                return response.redirectTo("");
            }

            // we already know it doesn't start with http, so lets fix that first
            // "/proxy/".length = 7
            return response.redirectTo("/http://" + request.url.substr(7));
        }

        // if there is no referer, then either they just got here or we can't help them
        if (!request.headers.referer) {
            return response.redirectTo(""); // "" because we don't want a trailing slash
        }

        var ref = url.parse(request.headers.referer);

        // if we couldn't parse the referrer or they came from another site, they send them to the home page
        if (!ref || ref.host != thisHost(request)) {
            return response.redirectTo(""); // "" because we don't want a trailing slash
        }

        // now we know where they came from, so we can do something for them
        if (ref.pathname.indexOf(prefix + 'http') === 0) {
            var real_url = url.parse(proxy.getRealUrl(ref.pathname));

            // now, take the requested pat on the previous known host and send the user on their way
            return response.redirectTo(real_url.protocol + "//" + real_url.host + request.url);
        }

        // else they were refered by something on this site that wasn't the home page and didn't come
        // through the proxy - aka this shouldn't happen
        response.redirectTo("");
    }

    // returns the configured host if one exists, otherwise the host that the current request came in on
    function thisHost(request) {
        if (config.host) {
            return config.host;
        } else {
            return request.headers.host; // normal case: include the hostname but assume we're either on a standard port or behind a reverse proxy
        }
    }

    // returns the http://site.com/proxy
    function thisSite(request) {
        return 'http://' + thisHost(request) + config.basePath;
    }

    function redirectTo(request, response, site) {
        site = site || "";
        if (site.length && site.substr(0, 1) != "/" && site.substr(0, 1) != "?") {
            site = "/" + site;
        }
        if (site.substr(0, config.basePath.length) == config.basePath) { // no /proxy/proxy redirects
            site = site.substr(config.basePath.length);
        }
        try {
            if (site == "/" || site === "") {
                response.writeHead(307, {
                    'Location': thisHost(request) + config.homepage
                });
            } else {
                response.writeHead(307, {
                    'Location': thisSite(request) + site
                });
            }
        } catch (ex) {
            // the headers were already sent - we can't redirect them
            console.error("Failed to send redirect", ex);
        }
        response.end();
    }
}

module.exports = Unblocker;
