"use strict";

var fs = require("fs");
var path = require("path");
var Transform = require("stream").Transform;
var serveStatic = require('serve-static');
var finalhandler = require('finalhandler');
var contentTypes = require("./content-types");

module.exports = function (config) {
  const clientDir = "client";
  const clientDirAbsolute = path.join(__dirname, clientDir)
  const staticPrefix = config.prefix + clientDir;

  // todo: enable immtable caching if NODE_ENV is production
  const handleStaticRequest = serveStatic(clientDirAbsolute, {
    index: false, // don't serve up index.html files for /
    fallthrough: false, // anything missing is a 404
  });

  function server(data) {
    const req = data.clientRequest;
    const res = data.clientResponse;
    const url = req.url;
    if (url.startsWith(staticPrefix) && url.length > staticPrefix.length) {
      // trim the URL down to be relative to the client dir
      req.originalUrl = url;
      req.url = url.substr(staticPrefix.length);
      // todo: allow handlers and middleware to be async, then drop finalhandler
      handleStaticRequest(req, res, finalhandler(req, res));
      return true; // true = this request has been handled, no need to process it further
    }
  }

  const CLIENT_SCRIPT_INIT =
    '<script type="module">\n' +
    fs
      .readFileSync(path.join(__dirname, clientDir, "init.template.mjs"))
      .toString()
      .replaceAll("CLIENT_PATH", staticPrefix)
      .replace("PREFIX", config.prefix) +
    "</script>";

  function createStream() {
    return new Transform({
      decodeStrings: false,
      transform: function (chunk, encoding, next) {
        var updated = chunk
          .toString()
          .replace(/(<head[^>]*>)/i, "$1\n" + CLIENT_SCRIPT_INIT + "\n");
        this.push(updated, "utf8");
        next();
      },
    });
  }

  function injector(data) {
    // todo: catch fetch and XMLHttpRequest and force those through the proxy
    // todo: fix postMessage
    // config._proxyWebsockets &&
    if (contentTypes.shouldProcess(config, data)) {
      data.stream = data.stream.pipe(createStream());
    }
  }

  injector.createStream = createStream;
  return {
    server,
    injector,
    createStream, // for testing
  };
};
