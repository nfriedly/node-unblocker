"use strict";

const http = require("http");
const async = require("async");
const { PassThrough } = require("stream");
const Unblocker = require("../lib/unblocker.js");
const UrlWrapper = require("../lib/prefix-url-wrapper");

function getUnblocker(options) {
  if (options.unblocker) {
    return options.unblocker;
  }
  return new Unblocker({});
}

function getProxyApp(unblocker) {
  function app(req, res) {
    // first let unblocker try to handle the requests
    unblocker(req, res, function (err) {
      // this callback will be fired for any request that unblocker does not serve
      const headers = {
        "content-type": "text/plain",
      };
      if (err) {
        console.error(err);
        res.writeHead(500, headers);
        return res.end(err.stack || err.message);
      }
      if (req.url == "/") {
        res.writeHead(200, headers);
        return res.end("this is the home page");
      } else {
        res.writeHead(404, headers);
        return res.end("Error 404: file not found.");
      }
    });
  }

  return app;
}

/**
 * Creates two servers, a proxy instance and a remote server that serves up sourceContent
 * @param options|sourceContent
 *  - options is an object with one or more of {sourceContent,charset,remoteApp,proxyApp},
 *  or
 *  - sourceContent can be a buffer or string that is automatically served by the default remoteApp
 * @param next
 */
exports.getServers = function (options, next) {
  if (typeof options == "string" || options instanceof Buffer) {
    options = {
      sourceContent: options,
    };
  }

  const remoteApp =
    options.remoteApp ||
    function sendContent(req, res) {
      res.writeHead(200, {
        "content-type":
          "text/html" + (options.charset ? "; charset=" + options.charset : ""),
      });
      res.end(options.sourceContent);
    };

  const unblocker = getUnblocker(options);

  const proxyApp = options.proxyApp || getProxyApp(unblocker);

  const proxyServer = http.createServer(proxyApp);
  const remoteServer = http.createServer(remoteApp);

  proxyServer.setTimeout(5000);
  remoteServer.setTimeout(5000);

  proxyServer.on("upgrade", unblocker.onUpgrade);

  async.parallel(
    [
      proxyServer.listen.bind(proxyServer),
      remoteServer.listen.bind(remoteServer),
    ],
    function (err) {
      if (err) {
        return next(err);
      }
      const ret = {
        proxyServer: proxyServer,
        proxyPort: proxyServer.address().port,
        remoteServer: remoteServer,
        remotePort: remoteServer.address().port,
        kill: function (next) {
          async.parallel(
            [
              remoteServer.close.bind(remoteServer),
              proxyServer.close.bind(proxyServer),
            ],
            next
          );
        },
      };
      ret.homeUrl = "http://localhost:" + ret.proxyPort + "/";
      ret.remoteUrl = "http://localhost:" + ret.remotePort + "/";
      ret.proxiedUrl = ret.homeUrl + "proxy/" + ret.remoteUrl;
      next(null, ret);
    }
  );
};

exports.getContext = function getContext(context = {}) {
  context = Object.assign(
    {
      url: new URL("http://example.com/"),
      rawUrl: "/proxy/http://example.com/",
      contentType: "text/html",
      headers: {},
      stream: new PassThrough(),
      clientRequest: {},
      clientResponse: {},
      isWebsocket: false,
      clientSocket: undefined,
      remoteRequest: {},
      remoteResponse: {
        statusCode: 200,
      },
    },
    context
  );
  if (typeof context.url === "string") {
    context.url = new URL(context.url);
  }
  context.urlWrapper = new UrlWrapper({
    proxyUrl: context._proxyUrl || new URL("http://proxy-host.invalid/proxy/"),
    remoteUrl: context.url,
  });

  return context;
};
