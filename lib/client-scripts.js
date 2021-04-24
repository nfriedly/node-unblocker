"use strict";
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

  function handleRequest(data) {
    if (data.html) {
      data.html.on("startTag", (event) => {
        if (event.startTag.tagName === "head") {
          event.insertAfter(`$1
<script src="${clientScriptPathWeb}"></script>
<script>unblocker.init(${JSON.stringify({
            prefix,
            url: data.url,
          })}, window);</script>
`);
        }
      });
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
    handleRequest,
    proxyScriptSync,
  };
};
