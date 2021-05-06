"use strict";

const _ = require("lodash");
const debug = require("debug")("unblocker:core");
const debugWS = require("debug")("unblocker:websocket");
const middlewareDebugger = require("./middleware-debugger.js");
const PrefixUrlWrapper = require("./prefix-url-wrapper.js");

// expose all built-in middleware
const host = require("./host.js");
const referer = require("./referer.js");
const cookies = require("./cookies.js");
const securityHeaders = require("./security-headers.js");
const redirects = require("./redirects.js");
Unblocker.decompress = require("./decompress.js");
Unblocker.charsets = require("./charsets.js");
const htmlParser = require("./html-parser.js");
const htmlRewriter = require("./rewrite-html.js");
const cssRewriter = require("./rewrite-css.js");
Unblocker.jsRewriter = require("./rewrite-js.js");
Unblocker.clientScripts = require("./client-scripts.js");
const metaRobots = require("./meta-robots.js");
const contentLength = require("./content-length.js");

// these aren't middleware, but are still worth exposing
Unblocker.proxy = require("./proxy.js");
const contentTypes = require("./content-types.js");
Unblocker.websockets = require("./websockets.js");

const defaultConfig = {
  prefix: "/proxy/",
  host: null, // can be used to override the url used in redirects
  requestMiddleware: [],
  responseMiddleware: [],
  clientScripts: true, // note: disabling standardMiddleware also disables clientScripts. It's mostly in a separate setting for testing
};

function Unblocker(_config) {
  if ("standardMiddleware" in _config) {
    console.warn(
      "The standardMiddleware option is not supported in Unblocker v3"
    );
  }
  if ("processContentTypes" in _config) {
    console.warn(
      "The processContentTypes option is not supported in Unblocker v3"
    );
  }

  const config = Object.assign({}, defaultConfig, _config);

  let processContentTypes = contentTypes.html.concat(contentTypes.css);
  if (config.clientScripts) {
    processContentTypes = processContentTypes.concat(contentTypes.js);
  }

  let clientScripts = null;

  const decompress = Unblocker.decompress({ processContentTypes });
  const charsets = Unblocker.charsets({ processContentTypes });
  // js rewriter is initialized below if enabled

  // this applies to every request that gets proxied
  config.requestMiddleware = [
    host,
    referer,
    decompress.handleRequest,
    cookies.handleRequest,
  ].concat(config.requestMiddleware);

  config.responseMiddleware = [
    securityHeaders,
    redirects,
    decompress.handleResponse,
    charsets,
    htmlParser,
    htmlRewriter,
    // js rewriter will be injected here if enabled
    cssRewriter.handleResponse,
    cookies.handleResponse,
    metaRobots,
  ].concat(config.responseMiddleware, [contentLength]);

  if (config.clientScripts) {
    // insert clientScripts after the htmlRewriter
    clientScripts = Unblocker.clientScripts(config);
    const position = config.responseMiddleware.indexOf(htmlRewriter) + 1;
    config.responseMiddleware.splice(position, 0, clientScripts.handleRequest);
  }

  // the middleware debugger logs details before/after each piece of middleware
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

  const proxy = Unblocker.proxy(config);

  const urlUnwrapper = new PrefixUrlWrapper(config);

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
    // default to express's more advanced version of this when available (handles X-Forwarded-Protocol headers)
    const proto =
      request.protocol ||
      request.headers["X-Forwarded-Protocol"] ||
      (request.connection.encrypted ? "https" : "http");
    return proto + "://" + thisHost(request) + config.prefix;
  }

  // this is only used here and in cookies
  function redirectTo(request, response, site, headers) {
    site = site || "";
    if (site.substr(0, 1) == "/") {
      site = site.substr(1);
    }
    if (site.substr(0, config.prefix.length) == config.prefix) {
      // no /proxy/proxy redirects
      site = site.substr(config.prefix.length);
    }
    const location = thisSite(request) + site;
    debug("redirecting to %s", location);
    try {
      response.writeHead(
        307,
        _.defaults(headers || {}, {
          Location: location,
        })
      );
    } catch (ex) {
      // Most likely because the headers were already sent
      console.error("Failed to send redirect", ex);
    }
    response.end();
  }

  function initContext(
    urlStr,
    clientRequest,
    clientResponse,
    clientSocket,
    clientHead
  ) {
    const url = new URL(urlStr);
    const rawUrl = clientRequest.url.substr(config.prefix.length);

    const urlWrapper = new PrefixUrlWrapper({
      proxyUrl: new URL(thisSite(clientRequest), "http://proxy-host.invalid"),
      remoteUrl: url,
    });

    // This is how api consumers can hook into requests.
    // The data object is passed to all requestMiddleware before the request is sent to the remote server,
    // and it is passed through all responseMiddleware before being sent to the client.
    const context = {
      url,
      rawUrl,
      clientRequest,
      clientResponse,
      headers: _.cloneDeep(clientRequest.headers),
      stream: clientRequest,
      isWebsocket: !!clientSocket,
      clientSocket,
      clientHead,
      urlWrapper,
    };

    // todo: rename this from data to context everywhere else
    return context;
  }

  // todo: see if this can be synchronous
  const clientScriptsServer = config.clientScripts
    ? clientScripts.server
    : (req, res, next) => next();

  // regular web requests
  function handleRequest(clientRequest, clientResponse, next) {
    if (!next) {
      next = function fallbackHandler() {
        clientResponse.writeHead(400);
        clientResponse.end("Unable to process request");
      };
    }

    clientScriptsServer(clientRequest, clientResponse, (err) => {
      if (err) return next(err);

      // todo: drop this
      clientResponse.redirectTo = redirectTo.bind(
        redirectTo,
        clientRequest,
        clientResponse
      );

      let urlStr = urlUnwrapper.unwrap(clientRequest.url);
      if (!urlUnwrapper.isValid(urlStr)) {
        const recoveredUrl = urlUnwrapper.recover(clientRequest);
        if (!recoveredUrl) {
          return next();
        }
        // If the raw URL isn't quite right, but we can figure it out, redirect to the correct URL.
        // Special exception for cases where routers collapsed slashes (see #130)
        if (recoveredUrl.replace("://", ":/") !== urlStr) {
          return clientResponse.redirectTo(recoveredUrl);
        } else {
          urlStr = recoveredUrl;
        }
      }
      // todo: pass url to initContext
      const context = initContext(urlStr, clientRequest, clientResponse);
      proxy(context, next);
    });
  }

  // websocket support
  const proxyWebsocket = Unblocker.websockets(config);

  handleRequest.onUpgrade = function onUpgrade(
    clientRequest,
    clientSocket,
    clientHead
  ) {
    debugWS("handling websocket req to", clientRequest.url);

    let urlStr = urlUnwrapper.unwrap(clientRequest.url);
    if (!urlUnwrapper.isValid(urlStr)) {
      const recoveredUrl = urlUnwrapper.recover(clientRequest);
      if (!recoveredUrl) {
        // nothing else to do, we don't know where the websocket is supposed to go.
        debugWS("unable to handle websocket upgrade", clientRequest.url);
        clientSocket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
        return;
      }
      // don't bother redirecting a websocket
      // a) it's not straightforward to do at this point
      // b) it wouldn't matter, because nothing else is relative to a websocket url
      urlStr = recoveredUrl;
    }

    const context = initContext(
      urlStr,
      clientRequest,
      null,
      clientSocket,
      clientHead
    );

    proxyWebsocket(context);
  };

  return handleRequest;
}

module.exports = Unblocker;
