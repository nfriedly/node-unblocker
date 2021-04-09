"use strict";

const path = require("path");
const { PassThrough, Transform } = require("stream");
const send = require("send");
const recast = require("recast");
const debug = require("debug")("unblocker:client-scripts");
const contentTypes = require("./content-types");
const concat = require("concat-stream");

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

  // const WRAPPER_START = "(function(window, location, document) {\n";
  // const WRAPPER_END =
  //   "\n}(unblocker.window, unblocker.location, unblocker.document));";

  const reHeadTag = /(<head[^>]*>)/i;
  // catches a partial tag at the end of a chunk; it will be cached until the next chunk
  const rePartialTag = /<[^>]*$/;

  function injector(data) {
    if (contentTypes.html.includes(data.contentType)) {
      // var open = [];
      let partialTag = "";
      data.stream = data.stream.pipe(
        new Transform({
          decodeStrings: false,
          transform: function (chunk, encoding, next) {
            // include any leftovers from the previous chunk
            let updated = partialTag + chunk.toString();
            partialTag = "";

            // wrap inline script tags from the site with our custom globals
            // updated = updated.replace(
            //   /<script([^>]*)>/gi,
            //   function (match, attrs) {
            //     debug("found script tag", match, attrs);
            //     if (attrs.includes("src=") || attrs.includes("json")) {
            //       open.push(false);
            //       return match;
            //     }
            //     // todo: make wrapper come after import/export statements for ES modules

            //     // todo: make this smarter
            //     debug("wrapping");
            //     open.push(true);
            //     return match + "\n" + WRAPPER_START;
            //   }
            // );
            // updated = updated.replace(/(<\/script>)/gi, function (match) {
            //   debug("found closing script tag", match, "stack is", open);
            //   if (open.shift()) {
            //     debug("unwrapping");
            //     return WRAPPER_END + "\n" + match;
            //   }
            //   return match;
            // });

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
      debug("rewriting js");
      // data.stream.write(WRAPPER_START);
      // data.stream = data.stream.pipe(
      //   new Transform({
      //     decodeStrings: false,
      //     transform: function (chunk, encoding, next) {
      //       this.push(chunk, encoding);
      //       next();
      //     },
      //     flush: function () {
      //       this.push(WRAPPER_END);
      //       this.push(null);
      //     },
      //   })
      // );

      // Having to download the entire script before beginning parsing sucks,
      // but I'm not aware of any streaming js parser/rewriter, and some of
      // this stuff just isn't feasible to do with regex's
      const inStream = data.stream;
      const outStream = new PassThrough();
      data.stream = outStream;
      inStream.setEncoding("utf8");
      inStream.pipe(
        concat(function (source) {
          // todo: figure out why source is sometimes an empty array
          outStream.end(
            (source && source.length && proxyScriptSync(source, data.url)) || ""
          );
        })
      );
    }
  }

  const b = recast.types.builders;

  //console.log('unblocker.maybeGetProxy(thing)', recast.parse('unblocker.maybeGetProxy(thing).location').program.body[0].expression);

  function proxyScriptSync(source, url) {
    try {
      // Sometimes JSON is prefixed with this and then sent as javascript
      // this prevents someone from overriding the Object constructor to read the contents of it.
      // It's really JSON, though, and we don't need to try to parse it.
      if (source.startsWith("for (;;);")) {
        return source;
      }

      const startLen = source.length;

      debug("parsing", url);
      const ast = recast.parse(source, {
        // babel works but takes a whopping 14 minutes to parse youtube's initial js file
        // esprima (the default) is slightly faster at 13 minutes, but chokes on some ES6 syntax
        // acorn can handle ES6 and is the fastest tested so far at 9 minutes
        // that's still way too slow, though...
        parser: require("recast/parsers/babel"),
        //ecmaVersion: 2020,
      });
      debug("parsed, modifying AST", url);
      // console.log(ast.program.body);

      // todo: handle strings, e.g. `var w = window, l = 'location', path = w[l].pathname`
      // todo: test http://dean.edwards.name/packer/ (current and previous versions) to see if it does anything that this can't catch
      // todo: document.cookie and document.baseURI

      const n = recast.types.namedTypes;
      recast.types.visit(ast, {
        visitMemberExpression(path) {
          //console.log('visitMemberExpression', path)
          this.traverse(path);

          const { node } = path;

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
        visitAssignmentExpression(path) {
          // console.log('visitAssignmentExpression', path);
          this.traverse(path);

          const { node } = path;
          if (n.Identifier.check(node.left) && node.left.name === "location") {
            // replace
            //    location = 'http://example.com/';
            // with
            //     if (location === window.location) {
            //       unblocker.window.location = 'http://example.com/';
            //     } else {
            //       location = 'http://example.com/';
            //     }
            path.parentPath.replace(
              b.ifStatement(
                b.binaryExpression(
                  "===",
                  b.identifier("location"),
                  b.memberExpression(
                    b.identifier("window"),
                    b.identifier("location")
                  )
                ),
                b.blockStatement([
                  b.expressionStatement(
                    b.assignmentExpression(
                      node.operator,
                      b.memberExpression(
                        b.memberExpression(
                          b.identifier("unblocker"),
                          b.identifier("window")
                        ),
                        b.identifier("location")
                      ),
                      node.right
                    )
                  ),
                ]),
                b.blockStatement([b.expressionStatement(node)])
              )
            );
          }
        },
      });

      debug("done modifying AST, converting back to string", url);
      source = recast.print(ast, { lineTerminator: "\n" }).code;
      // todo: set a flag instead of checking the length
      debug("done,", source.length === startLen ? "no change" : "converted");
      return source;
    } catch (er) {
      console.error(
        `Error rewriting script: ${er.message}, returning original: ${url}`
      );
      let errSrc;
      if (er.pos) {
        errSrc = source.substr(er.pos - 20, 40);
        errSrc += "\n" + new Array(19).join("-") + "^";
      } else {
        errSrc = source.substring(0, 100) + "...";
      }
      console.error(errSrc);
      return source;
    }
  }

  return {
    server,
    injector,
    proxyScriptSync,
  };
};
