"use strict";

var url = require("url");
var _ = require("lodash");
var debug = require("debug")("unblocker:core");
var debugWS = require("debug")("unblocker:websocket");
var middlewareDebugger = require("./middleware-debugger.js");

// expose all built-in middleware
Unblocker.host = require("./host.js");
Unblocker.referer = require("./referer.js");
Unblocker.cookies = require("./cookies.js");
Unblocker.hsts = require("./hsts.js");
Unblocker.hpkp = require("./hpkp.js");
Unblocker.csp = require("./csp.js");
Unblocker.redirects = require("./redirects.js");
Unblocker.decompress = require("./decompress.js");
Unblocker.charsets = require("./charsets.js");
Unblocker.urlPrefixer = require("./url-prefixer.js");
Unblocker.clientScripts = require('./client-scripts.js');
Unblocker.metaRobots = require("./meta-robots.js");
Unblocker.contentLength = require("./content-length.js");

// these aren't middleware, but are still worth exposing
Unblocker.proxy = require("./proxy.js");
Unblocker.contentTypes = require("./content-types.js");
Unblocker.getRealUrl = require("./get-real-url.js");
Unblocker.websockets = require("./websockets.js");

var defaultConfig = {
  prefix: "/proxy/",
  host: null, // can be used to override the url used in redirects
  requestMiddleware: [],
  responseMiddleware: [],
  standardMiddleware: true,
  processContentTypes: Unblocker.contentTypes.html.concat(
    Unblocker.contentTypes.css
  ),
};

function Unblocker(config) {
  _.defaults(config, defaultConfig);

  // html is getting through but images are choking, and js only makes it when not run through urlPrefixStream

  if (config.prefix.substr(-1) != "/") {
    config.prefix += "/";
  }

  if (config.standardMiddleware !== false) {
    var host = Unblocker.host(config);
    var referer = Unblocker.referer(config);
    var cookies = Unblocker.cookies(config);
    var hsts = Unblocker.hsts(config);
    var hpkp = Unblocker.hpkp(config);
    var csp = Unblocker.csp(config);
    var redirects = Unblocker.redirects(config);
    var decompress = Unblocker.decompress(config);
    var charsets = Unblocker.charsets(config);
    var urlPrefixer = Unblocker.urlPrefixer(config);
        var clientScripts = Unblocker.clientScripts(config);
    var metaRobots = Unblocker.metaRobots(config);
    var contentLength = Unblocker.contentLength(config);

    config.requestMiddleware = [
      host,
      referer,
      decompress.handleRequest,
      cookies.handleRequest,
    ].concat(config.requestMiddleware);

    config.responseMiddleware = [
      hsts,
      hpkp,
      csp,
      redirects,
      decompress.handleResponse,
      charsets,
      urlPrefixer,
            clientScripts,
      cookies.handleResponse,
      metaRobots,
    ].concat(config.responseMiddleware, [contentLength]);
  }

  // todo: check if config.debug is enabled first
  if (middlewareDebugger.enabled) {
    config.requestMiddleware = middlewareDebugger.debugMiddleware(
      config.requestMiddleware,
      "request"
    );
    config.responseMiddleware = middlewareDebugger.debugMiddleware(
      config.responseMiddleware,
      "response"
    );
  }

  debug("Unblocker initialized, config: ", config);

  var proxy = Unblocker.proxy(config);

  var getRealUrl = Unblocker.getRealUrl(config);

  function handleRequest(clientRequest, clientResponse, next) {
    // default to express's more advanced version of this when available (handles X-Forwarded-Protocol headers)
    if (!clientRequest.protocol) {
      clientRequest.protocol = clientRequest.connection.encrypted
        ? "https"
        : "http";
    }

    // convenience methods
    clientRequest.thisHost = thisHost.bind(thisHost, clientRequest);
    clientRequest.thisSite = thisSite.bind(thisSite, clientRequest);
    clientResponse.redirectTo = redirectTo.bind(
      redirectTo,
      clientRequest,
      clientResponse
    );

    if (!next) {
      next = function () {
        clientResponse.redirectTo("");
      };
    }

    var url_data = url.parse(clientRequest.url);

    // only requests that start with this get proxied - the rest get
    // redirected to either a url that matches this or the home page
    if (url_data.pathname.indexOf(config.prefix + "http") === 0) {
      var uri = url.parse(getRealUrl(clientRequest.url));

      // redirect urls like /proxy/http://asdf.com to /proxy/http://asdf.com/ to make relative image paths work
      // but, don't redirect in cases where routers collapsed '//' to '/' (#130)
      var formatted = url.format(uri);
      var raw = clientRequest.url.substr(config.prefix.length);
      if (formatted !== raw && formatted.replace("://", ":/") !== raw) {
        return clientResponse.redirectTo(formatted);
      }

      // this is how api consumers can hook into requests. The data object is passed to all requestMiddleware before the request is sent to the remote server, and it is passed through all responseMiddleware before being sent to the client.
      var data = {
        url: formatted,
        clientRequest: clientRequest,
        clientResponse: clientResponse,
        headers: _.cloneDeep(clientRequest.headers),
        stream: clientRequest,
      };

      proxy(data, next);
    } else {
      // any other url gets redirected to the correct proxied url if we can
      // determine it based on their referrer, or passed back to express (or whatever) otherwise
      handleUnknown(clientRequest, clientResponse, next);
    }
  }

  /**
   * This is what makes this server magic: if we get an unrecognized request that wasn't corrected by
   * proxy's filter, this checks the referrer to determine what the path should be, and then issues a
   * 307 redirect to a proxied url at that path
   *
   * todo: handle querystring and post data
   */
  function handleUnknown(request, response, next) {
    if (request.url.indexOf(config.prefix) === 0) {
      // handles /proxy/ and /proxy
      if (
        request.url == config.prefix ||
        request.url == config.prefix.substr(0, config.prefix.length - 1)
      ) {
        return response.redirectTo("");
      }
      // handles cases like like /proxy/google.com and redirects to /proxy/http://google.com/
      return response.redirectTo(
        "http://" + request.url.substr(config.prefix.length)
      );
    }

    // if there is no referer, then either they just got here or we can't help them
    if (!request.headers.referer) {
      return next(); // in express apps, this will let it try for other things at this url. Otherwise, it just redirects to the home page
    }

    var ref = url.parse(request.headers.referer);

    // if we couldn't parse the referrer or they came from another site, they send them to the home page
    if (!ref || ref.host != thisHost(request)) {
      return next();
    }

    // now we know where they came from, so we can do something for them
    if (ref.pathname.indexOf(config.prefix + "http") === 0) {
      var real_url = getRealUrl(ref.pathname);
      var real_uri = url.parse(real_url);
      var target_url = real_uri.protocol + "//" + real_uri.host + request.url;
      debug("recovering broken link to %s", request.url);
      // now, take the requested pat on the previous known host and send the user on their way
      // todo: make sure req.url includes the querystring
      return response.redirectTo(target_url);
    }

    // fallback - there was a referer, but it wasn't one that we could use to determine the correct path
    next();
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
    // todo: return https when appropriate
    return request.protocol + "://" + thisHost(request) + config.prefix;
  }

  function redirectTo(request, response, site, headers) {
    site = site || "";
    if (site.substr(0, 1) == "/") {
      site = site.substr(1);
    }
    if (site.substr(0, config.prefix.length) == config.prefix) {
      // no /proxy/proxy redirects
      site = site.substr(config.prefix.length);
    }
    var location = request.thisSite() + site;
    debug("redirecting to %s", location);
    try {
      response.writeHead(
        307,
        _.defaults(headers || {}, {
          Location: location,
        })
      );
    } catch (ex) {
      // the headers were already sent - we can't redirect them
      console.error("Failed to send redirect", ex);
    }
    response.end();
  }

    // websocket support
    // todo: move most or all of this to websockets.js

    var
        http = require("http"),
        https = require("https");

    var debugWS = require("debug")("unblocker:websocket");
    handleRequest.onUpgrade = function onUpgrade(clientRequest, clientSocket, clientHead) {



        debugWS("handling websocket req to", clientRequest.url);
        // default to express's more advanced version of this when available (handles X-Forwarded-Protocol headers)
        clientRequest.protocol =
            clientRequest.protocol || clientRequest.connection.encrypted ?
            "https" :
            "http";

        // convenience methods
        clientRequest.thisHost = thisHost.bind(thisHost, clientRequest);
        clientRequest.thisSite = thisSite.bind(thisSite, clientRequest);

        var url_data = url.parse(clientRequest.url);

        // only requests that start with this get proxied - the rest get
        // redirected to either a url that matches this or the home page
        if (url_data.pathname.indexOf(config.prefix + "http") === 0) {
            var uri = url.parse(getRealUrl(clientRequest.url));
            var formatted = url.format(uri);

            // this is how api consumers can hook into requests. The data object is passed to all requestMiddleware before the request is sent to the remote server, and it is passed through all responseMiddleware before being sent to the client.
            var data = {
                url: formatted,
                clientRequest: clientRequest,
                clientResponse: clientSocket,
                clientSocket: clientSocket,
                headers: _.cloneDeep(clientRequest.headers),
                stream: clientRequest,
            };

            var onError = function() {
                console.error('error', arguments);
                clientSocket.end();
            }

            var middlewareHandledRequest = _.some(config.requestMiddleware, function(middleware) {
                middleware(data);
                return data.clientResponse.headersSent; // if true, then _.some will stop processing middleware here because we can no longer
            });

            if (!middlewareHandledRequest) {

                var options = {
                    host: uri.hostname,
                    port: uri.port,
                    path: uri.path,
                    method: data.clientRequest.method,
                    headers: data.headers
                };

                //set the agent for the request.
                if (uri.protocol == 'http:' && config.httpAgent) {
                    options.agent = config.httpAgent;
                }
                if (uri.protocol == 'https:' && config.httpsAgent) {
                    options.agent = config.httpsAgent;
                }

                // what protocol to use for outgoing connections.
                var proto = (uri.protocol == 'https:') ? https : http;

                debugWS('sending remote request: ', options);

                data.remoteRequest = proto.request(options, function(remoteResponse) {
                    debugWS("websocket remote response recieved");
                    data.remoteResponse = remoteResponse;
                    data.remoteResponse.on('error', onError);
                });

                data.remoteRequest.on('error', onError);

                if (clientHead && clientHead.length) {
                    debugWS("sending clientHead", clientHead);
                    data.remoteRequest.write(clientHead);
                }

                data.remoteRequest.end(); // Done sending opening data. Doesn't prevent upgrad event or close the connection.


                data.remoteRequest.on("upgrade", function(
                    remoteResponse,
                    remoteSocket,
                    remoteHead
                ) {
                    debugWS("websocket proxy established", remoteResponse.rawHeaders);

                    var key = true;
                    var headers =
                        "HTTP/1.1 101 Web Socket Protocol Handshake\r\n";
                    remoteResponse.rawHeaders.forEach(function(val) {
                        headers += val + (key ? ': ' : '\r\n');
                        key = !key;
                    })
                    headers += "\r\n";

                    debugWS("sending headers", headers);

                    clientSocket.write(headers);


                    data.remoteResponse = remoteResponse;

                    if (remoteHead && remoteHead.length) {
                        debugWS("sending remoteHead", remoteHead);
                        clientSocket.write(remoteHead);
                    }
                    clientSocket.pipe(remoteSocket);
                    remoteSocket.pipe(clientSocket);

                    // data dump
                    clientSocket.on("data", function(chunk) {
                        debugWS("from ws client: ", chunk.toString());
                    });
                    remoteSocket.on("data", function(chunk) {
                        debugWS("from ws remote: ", chunk.toString());
                    });
                    // todo: handle errors, clean exits, etc
                });
            }
        } else {
            // any other url gets redirected to the correct proxied url if we can
            // determine it based on their referrer, or passed back to express (or whatever) otherwise
            // todo: make sure this works with websockets
            handleUnknown(clientRequest, clientSocket, next);
        }
    };

  return handleRequest;
}

module.exports = Unblocker;
module.exports.defaultConfig = defaultConfig;
