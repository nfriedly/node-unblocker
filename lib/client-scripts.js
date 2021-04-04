"use strict";

var path = require("path");
var Transform = require("stream").Transform;
var send = require("send");
const recast = require("recast");
var debug = require("debug")("unblocker:client-scripts");
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

  const WRAPPER_START = "(function(window, location, document) {\n";
  const WRAPPER_END =
    "\n}(unblocker.window, unblocker.location, unblocker.document));";

  const reHeadTag = /(<head[^>]*>)/i;
  // catches a partial tag at the end of a chunk; it will be cached until the next chunk
  const rePartialTag = /<[^>]*$/;

  function injector(data) {
    if (contentTypes.html.includes(data.contentType)) {
      var open = [];
      var partialTag = "";
      data.stream = data.stream.pipe(
        new Transform({
          decodeStrings: false,
          transform: function (chunk, encoding, next) {
            // include any leftovers from the previous chunk
            var updated = partialTag + chunk.toString();
            partialTag = "";

            // wrap inline script tags from the site with our custom globals
            updated = updated.replace(
              /<script([^>]*)>/gi,
              function (match, attrs) {
                debug("found script tag", match, attrs);
                if (attrs.includes("src=") || attrs.includes("json")) {
                  open.push(false);
                  return match;
                }
                // todo: make wrapper come after import/export statements for ES modules

                // todo: make this smarter
                debug("wrapping");
                open.push(true);
                return match + "\n" + WRAPPER_START;
              }
            );
            updated = updated.replace(/(<\/script>)/gi, function (match) {
              debug("found closing script tag", match, "stack is", open);
              if (open.shift()) {
                debug("unwrapping");
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
      data.stream.write(WRAPPER_START);
      data.stream = data.stream.pipe(
        new Transform({
          decodeStrings: false,
          transform: function (chunk, encoding, next) {
            this.push(chunk, encoding);
            next();
          },
          flush: function () {
            this.push(WRAPPER_END);
            this.push(null);
          },
        })
      );
    }
  }

  const b = recast.types.builders;

  //console.log('unblocker.maybeGetProxy(thing)', recast.parse('unblocker.maybeGetProxy(thing).location').program.body[0].expression);

  function proxyScriptSync(source) {
    const ast = recast.parse(source);
    //console.log(ast);

    const n = recast.types.namedTypes;
    recast.types.visit(ast, {
      visitMemberExpression(path) {
        //console.log('visitMemberExpression', path)
        this.traverse(path);

        var node = path.node;

        // find:
        //    `something.location`
        // replace with:
        //    `unblocker.maybeGetProxy(something).location`
        if (
          n.Identifier.check(node.property) &&
          node.property.name === "location"
        ) {
          path.replace(
            b.memberExpression(
              b.callExpression(
                b.memberExpression(
                  b.identifier("unblocker"),
                  b.identifier("maybeGetProxy")
                ),
                [node.object]
              ),
              node.property
            )
          );
        }

        // find:
        //    `location.something`
        // replace with:
        //    `unblocker.location.something`
        if (
          n.Identifier.check(node.object) &&
          node.object.name === "location"
        ) {
          path.replace(
            b.memberExpression(
              b.memberExpression(
                b.identifier("unblocker"),
                b.identifier("location")
              ),
              node.property
            )
          );
        }
      },
    });
    return recast.print(ast).code;
  }

  return {
    server,
    injector,
    proxyScriptSync,
  };
};
