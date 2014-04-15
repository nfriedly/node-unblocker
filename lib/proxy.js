var url = require('url'),
    http = require('http'),
    https = require('https'),
    zlib = require('zlib'),

    _ = require('underscore'),

    cookies = require('./cookies'),
    encoding = require('./encodingstream'),
    urlPrefix = require('./urlprefixstream'),
    metaRobots = require('./metarobotsstream'),
    googleAnalytics = require('./googleanalyticsstream');

var config = {
    prefix: '/proxy/'
};

function setConfig(conf) {
    _.defaults(conf, config);
    setupUrlPrefix();
}

function setupUrlPrefix() {
    urlPrefix.setDefaults({
        prefix: config.prefix
    });
}
setupUrlPrefix();


var portmap = {
    "http:": 80,
    "https:": 443
};


/**
 * Makes the outgoing request and relays it to the client, modifying it along the way if necessary
 */
function proxy(uri, request, response) {
    request.session = request.session || {};

    // redirect urls like /proxy/http://asdf.com to /proxy/http://asdf.com/ to make relative image paths work
    var formatted = url.format(uri);
    if (formatted != request.url.substr(config.prefix.length)) {
        return response.redirectTo(formatted);
    }

    uri.port = uri.port || portmap[uri.protocol];
    uri.pathname = uri.search ? uri.pathname + uri.search : uri.pathname;

    var headers = copy(request.headers);

    delete headers.host;

    // todo: grab any new cookies in headers.cookie (set by JS) and store them in the session
    // (assume / path and same domain as request's referer)
    headers.cookie = cookies.get(request, uri);

    //console.log("sending these cookies: " + headers.cookie);

    // overwrite the referer with the correct referer
    if (request.headers.referer) {
        headers.referer = getRealUrl(request.headers.referer);
    }

    var options = {
        host: uri.hostname,
        port: uri.port,
        path: uri.pathname,
        method: request.method,
        headers: headers
    };

    // what protocol to use for outgoing connections.
    var proto = (uri.protocol == 'https:') ? https : http;

    var remote_request = proto.request(options, function(remote_response) {

        // make a copy of the headers to fiddle with
        var headers = copy(remote_response.headers);

        var content_type = headers['content-type'] || "unknown",
            ct = content_type.split(";")[0];

        var needs_parsed = ([
            'text/html',
            'application/xml+xhtml',
            'application/xhtml+xml',
            'text/css',
            'text/javascript',
            'application/javascript',
            'application/x-javascript'
        ].indexOf(ct) != -1);

        // if we might be modifying the response, nuke any content-length headers
        if (needs_parsed) {
            delete headers['content-length'];
        }

        var needs_decoded = (needs_parsed && headers['content-encoding'] == 'gzip');

        // we're going to de-gzip it, so nuke that header
        if (needs_decoded) {
            delete headers['content-encoding'];
        }

        // fix absolute path redirects 
        // (relative redirects will be 302'd to the correct path, and they're disallowed by the RFC anyways
        // todo: also fix refresh and url headers
        if (headers.location && headers.location.substr(0, 4) == 'http') {
            headers.location = request.thisSite() + "/" + headers.location;
            //console.log("fixing redirect");
        }

        if (headers['set-cookie']) {
            cookies.set(request, uri, headers['set-cookie']);
            delete headers['set-cookie'];
        }

        //  fire off out (possibly modified) headers
        response.writeHead(remote_response.statusCode, headers);

        //console.log("content-type: " + ct);
        //console.log("needs_parsed: " + needs_parsed);
        //console.log("needs_decoded: " + needs_decoded);

        // if we're dealing with gzipped input, set up a stream decompressor to handle output
        if (needs_decoded) {
            remote_response = remote_response.pipe(zlib.createUnzip());
        }

        if (needs_parsed) {
            var encodingStreams = encoding.createStreams(content_type); // note: two streams here - one to decode to UTF-8 and one to re-encode to whatever it started as
            var urlPrefixStream = urlPrefix.createStream({
                uri: uri
            });
            var metaRobotsStream = metaRobots.createStream();
            var gAStream = googleAnalytics.createStream();
            remote_response = remote_response.pipe(encodingStreams.decode)
                .pipe(urlPrefixStream)
                .pipe(metaRobotsStream)
                .pipe(gAStream)
                .pipe(encodingStreams.recode);
        }

        remote_response.pipe(response);
    });

    remote_request.addListener('error', function(err) {
        response.redirectTo("?error=" + err.toString());
    });

    // pass along POST data & let the remote server know when we're done sending data
    request.pipe(remote_request);
}

/**
 * Takes a /proxy/http://site.com url from a request or a referer and returns the http://site.com/ part
 */
function getRealUrl(path) {
    var uri = url.parse(path),
        real_url = uri.pathname.substr(config.prefix.length);
    // we also need to include any querystring data in the real_url
    return uri.search ? real_url + uri.search : real_url;
}



/**
 * returns a shallow copy of an object
 */
function copy(source) {
    var n = {};
    for (var key in source) {
        if (source.hasOwnProperty(key)) {
            n[key] = source[key];
        }
    }
    return n;
}

module.exports = proxy;
module.exports.proxy = proxy;
module.exports.getRealUrl = getRealUrl;
module.exports.config = config;
module.exports.setConfig = setConfig;
