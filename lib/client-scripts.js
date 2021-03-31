"use strict";

var path = require("path");
var Transform = require("stream").Transform;
var send = require("send");
var debug = require('debug')('unblocker:client-scripts');
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
  const WRAPPER_END = '\n}(unblocker.window, unblocker.location, unblocker.document));';

  const reHeadTag = /(<head[^>]*>)/i;

  function injector(data) {
    if (contentTypes.html.includes(data.contentType)) {
      var open = [];
      data.stream = data.stream.pipe(
        new Transform({
          decodeStrings: false,
          transform: function (chunk, encoding, next) {
            // wrap inline script tags from the site with our custom globals
            var updated = chunk.toString();
            updated = updated.replace(/<script([^>]*)>/ig, function(match, attrs) {
              debug('found script tag', match, attrs)
              if(attrs.includes('src=') || attrs.includes('json')) {
                open.push(false)
                return match;
              }
              // todo: make wrapper come after import/export statements for ES modules

              // todo: make this smarter
              debug('wrapping')
              open.push(true);
              return match + "\n" + WRAPPER_START
            });
            updated = updated.replace(/(<\/script>)/ig, function(match) {
              debug('found closing script tag', match, 'stack is', open)
              if (open.shift()) {
                debug('unwrapping');
                return WRAPPER_END + "\n" + match;
              }
              return match;
            });

            // todo: only inject once (maybe make an "injects into head" helper)
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
            this.push(WRAPPER_END);
            this.push(null);
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
