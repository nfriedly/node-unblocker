"use strict";

var fs = require("fs");
var path = require("path");
var Transform = require("stream").Transform;
var contentTypes = require("./content-types");

module.exports = function ({ prefix }) {
  const clientDir = "client";
  const clientScriptPathWeb = prefix + clientDir + "/unblocker-client.js";
  const clientScriptPathFs = path.join(
    __dirname,
    clientDir,
    "unblocker-client.js"
  );

  const INJECTION_SNIPET = `
<script>var unblocker=${JSON.stringify({ prefix })}</script>
<script src="${clientScriptPathWeb}"></script>`;

  function server(req, res, next) {
    if (req.url === clientScriptPathWeb) {
      // todo: etag (always), expires (in production). Maybe use the send module
      res.writeHead(200, {
        "content-type": "application/javascript; charset=UTF-8",
      });
      fs.createReadStream(clientScriptPathFs).pipe(res);
      return;
    }
    next();
  }

  function createStream() {
    return new Transform({
      decodeStrings: false,
      transform: function (chunk, encoding, next) {
        // todo: only inject once (maybe make an "injects into head" helper)
        var updated = chunk
          .toString()
          .replace(/(<head[^>]*>)/i, "$1" + INJECTION_SNIPET + "\n");
        this.push(updated, "utf8");
        next();
      },
    });
  }

  function injector(data) {
    if (contentTypes.html.includes(data.contentType)) {
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
