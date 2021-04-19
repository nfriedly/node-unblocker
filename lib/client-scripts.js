"use strict";
const { Transform } = require("stream");
const path = require("path");
const send = require("send");
const debug = require("debug")("unblocker:client-scripts");
const contentTypes = require("./content-types");
const { RewriteJsStream, rewriteJsSync } = require("./rewrite-js.js");

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

  // const WRAPPER_START = ""; //"(function(location) {\n";
  // const WRAPPER_END = "";
  // ("\n}(unblocker.location));");
  // todo: be more surgical about window and document references, replace with maybeGetProxy
  // maybe I can use regex's to narrow down to statements with .location (or a few related keywords),
  // then use recast to parse and rewrite just that statement

  const reHeadTag = /(<head[^>]*>)/i;
  // catches a partial tag at the end of a chunk; it will be cached until the next chunk
  const rePartialTag = /<[^>]*$/;

  // todo: rename this
  function injector(data) {
    if (contentTypes.html.includes(data.contentType)) {
      let partialTag = "";
      data.stream = data.stream.pipe(
        new Transform({
          decodeStrings: false,
          transform: function (chunk, encoding, next) {
            // include any leftovers from the previous chunk
            let updated = partialTag + chunk.toString();
            partialTag = "";

            // todo: use the html parser to inject
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

            // don't loose tags that are split across chunks
            updated = updated.replace(rePartialTag, function (match) {
              partialTag = match;
              return "";
            });

            this.push(updated, "utf8");
            next();
          },
          flush: function () {
            if (partialTag) {
              this.push(partialTag, "utf8");
            }
            this.push(null);
          },
        })
      );
    } else if (contentTypes.javascript.includes(data.contentType)) {
      debug("rewriting js file", data.url.href);
      data.stream = data.stream.pipe(new RewriteJsStream({ url: data.url }));
    }
  }

  // todo: hook into the html parser from this file rather than vice-versa
  function proxyScriptSync(source, url) {
    debug("rewriting inline script tag", url);

    // Sometimes JSON is prefixed with this and then sent as javascript
    // this prevents someone from overriding the Object constructor to read the contents of it.
    // It's really JSON, though, and we don't need to try to parse it.
    if (source.startsWith("for (;;);")) {
      return source;
    }

    return rewriteJsSync(source, { url });
  }

  return {
    server,
    injector,
    proxyScriptSync,
  };
};
