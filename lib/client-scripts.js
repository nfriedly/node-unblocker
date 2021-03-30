"use strict";

var path = require("path");
var Transform = require("stream").Transform;
var send = require("send");
var contentTypes = require("./content-types");

module.exports = function ({ prefix }) {
  const clientDir = "client";
  const clientScriptPathWeb = prefix + clientDir + "/unblocker-client.js";
  const clientScriptPathFs = path.join(
    __dirname,
    clientDir,
    "unblocker-client.js"
  );
  const isProduction = process.env.NODE_ENV === "production";
  const sendOpts = {
    acceptRanges: false,
    immutable: isProduction,
    index: false,
    maxAge: "10m",
  };

  function server(req, res, next) {
    if (req.url === clientScriptPathWeb) {
      send(req, clientScriptPathFs, sendOpts).pipe(res);
      return;
    }
    next();
  }

  const WRAPPER_START = '(function(window, location, document) {\n';
  const WRAPPER_END = '\n}(unblocker.getWindowWrapper(), unblocker.getLocationWrapper(), unblocker.getDocumentWrapper()));';

  const reHeadTag = /(<head[^>]*>)/i;

  function injector(data) {
    if (contentTypes.html.includes(data.contentType)) {
      var open = false;
      data.stream = data.stream.pipe(
        new Transform({
          decodeStrings: false,
          transform: function (chunk, encoding, next) {
            // todo: only inject once (maybe make an "injects into head" helper)
            var updated = chunk.toString();
            // todo: track open state when injecting wrapper start, only inject end when open
            updated = updated.replace(/(<script>)/ig, "$1\n" + WRAPPER_START);
            updated = updated.replace(/(<\/script>)/ig, WRAPPER_END + "\n$1");
            updated = updated.replace(
              reHeadTag,
              `$1
<script src="${clientScriptPathWeb}"></script>
<script>unblocker.init(${JSON.stringify({
                prefix,
                url: data.url,
              })}, window);</script>
`
            );
            this.push(updated, "utf8");
            next();
          },
        })
      );
    } else if (contentTypes.javascript.includes(data.contentType)) {
      data.stream.write(WRAPPER_START);
      data.stream = data.stream.pipe(
        new Transform({
          decodeStrings: false,
          transform: function (chunk, encoding, next) {
            this.push(chunk, encoding);
            next();
          },
          flush: function() {
            this.push(WRAPPER_END)
          }
        })
      );
    }
  }

  function wrapper(stream) {
  }

  return {
    server,
    injector,
  };
};
