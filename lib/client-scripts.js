"use strict";

var fs = require("fs");
var path = require("path");
var Transform = require("stream").Transform;
var contentTypes = require("./content-types");

module.exports = function (config) {
  const clientDir = "client";
  const clientScriptPath = config.prefix + clientDir + "/unblocker.js";

  // todo: async
  function generateClientScript() {
    return fs
      .readFileSync(path.join(__dirname, clientDir, "unblocker.template.js"))
      .toString()
      .replace("PREFIX", config.prefix);
  }

  function server(req, res, next) {
    if (req.url === clientScriptPath) {
      // todo: make this better, at least for NODE_ENV=production
      res.writeHead(200, {
        "content-type": "application/javascript; charset=UTF-8",
      });
      res.end(generateClientScript());
      return;
    }
    next();
  }

  const CLIENT_SCRIPT_INIT = `<script src="${clientScriptPath}"></script>`;

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
