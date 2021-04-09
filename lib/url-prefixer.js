"use strict";

/**
 * This file creates a node.js Stream that re-writes chunks of HTML on-the-fly so that all
 * non-relative URLS are prefixed with the given string.
 *
 * For example, If you set the config.prefix to '/proxy/' and pass in this chunk of html:
 *   <a href="http://example.com/">link to example.com</a>
 * It would output this:
 *   <a href="/proxy/http://example.com/">link to example.com</a>
 *
 * It buffers a small amount of text from the end of each chunk to ensure that it properly
 * handles links that are split between two chunks (packets).
 */

var Transform = require("stream").Transform;
const RewritingStream = require("parse5-html-rewriting-stream");
var debug = require("debug")("unblocker:url-prefixer");
var contentTypes = require("./content-types.js");
// const { fixUrl } = require("./client/unblocker-client");

function urlPrefixer(config) {
  var re_abs_url = /(["'=]|url\(\s*)(https?:)/gi, // "http:, 'http:, =http:, or url( http:, also matches https versions
    re_rel_proto = /(["'=]|url\(\s*)(\/\/\w)/gi, // matches //site.com style urls where the protocol is auto-sensed
    re_rel_root = /((href=|src=|action=|url\(\s*)['"]?)(\/.)/gi, // matches root-relative urls like /foo/bar.html
    // no need to match href="asdf/adf" relative links - those will work without modification

    // partial's don't cause anything to get changed, they just cause last few characters to be buffered and checked with the next batch
    re_html_partial = /((url\(\s*)?\s\S+\s*)$/, // capture the last two "words" and any space after them handles chunks ending in things like `<a href=` and `background-image: url( ` or `url h`
    // things that shouldn't be proxied
    // (in order to keep this a little bit simpler, the initial regex proxies it, and then the second one unproxies it)
    // matches broken xmlns attributes like xmlns="/proxy/http://www.w3.org/1999/xhtml" and xmlns:og="/proxy/http://ogp.me/ns#"
    re_proxied_xmlns = new RegExp('(xmlns(:[a-z]+)?=")' + config.prefix, "ig"),
    re_proxied_doctype = new RegExp('(<!DOCTYPE[^>]+")' + config.prefix, "i");

  function rewriteUrls(chunk, uri, prefix) {
    // first upgrade // links to regular http/https links because otherwise they look like root-relative (/whatever.html) links
    chunk = chunk.replace(re_rel_proto, "$1" + uri.protocol + "$2");
    // next replace urls that are relative to the root of the domain (/whatever.html) because this is how proxied urls look
    chunk = chunk.replace(
      re_rel_root,
      "$1" + uri.protocol + "//" + uri.host + "$3"
    );
    // last replace any complete urls
    chunk = chunk.replace(re_abs_url, "$1" + prefix + "$2");

    // fix xmlns attributes that were broken because they contained urls.
    // (JS RegExp doesn't support negative lookbehind, so breaking and then fixing is simpler than trying to not break in the first place)
    chunk = chunk.replace(re_proxied_xmlns, "$1");
    chunk = chunk.replace(re_proxied_doctype, "$1");

    return chunk;
  }

  function createStream(uri) {
    // sometimes a chunk will end in data that may need to be modified, but it is impossible to tell
    // in that case, buffer the end and prepend it to the next chunk
    var chunk_remainder;

    return new Transform({
      decodeStrings: false,

      transform: function (chunk, encoding, next) {
        chunk = chunk.toString();
        if (chunk_remainder) {
          chunk = chunk_remainder + chunk;
          chunk_remainder = undefined;
        }

        // second, check if any urls are partially present in the end of the chunk,
        // and buffer the end of the chunk if so; otherwise pass it along
        var partial_hits = chunk.match(re_html_partial);
        if (partial_hits && partial_hits[1]) {
          var snip = partial_hits[1].length;
          chunk_remainder = chunk.substr(-1 * snip);
          chunk = chunk.substr(0, chunk.length - snip);
        }

        chunk = rewriteUrls(chunk, uri, config.prefix);

        this.push(chunk);
        next();
      },

      flush: function (done) {
        // if we buffered a bit of text but we're now at the end of the data, then apparently
        // it wasn't a url - send it along
        if (chunk_remainder) {
          this.push(rewriteUrls(chunk_remainder, uri, config.prefix));
          chunk_remainder = undefined;
        }
        done();
      },
    });
  }

  function urlNeedsFixed(urlStr) {
    return (
      urlStr.startsWith("/") ||
      urlStr.startsWith("http://") ||
      urlStr.startsWith("https://") ||
      // Sometimes these are OK, but some sites (such as surviv.io) use ../ urls at the root path
      // That would cause something like:
      //   ../img/foo.jpg
      // to be resolved by the browser as:
      //   /proxy/http://img/foo.jpg
      // if we didn't fix it first.
      urlStr.startsWith("..")
    );
  }

  function fixUrl(urlStr, base) {
    return config.prefix + new URL(urlStr, base).href;
  }

  const { proxyScriptSync } = require("./client-scripts")(config);

  // todo: add a video tag with a poster to the tests
  const prefixAttrs = ["src", "href", "action", "formaction", "poster"];

  function prefixUrls(data) {
    let expectingCSS = false;
    let expectingJS = false;
    if (contentTypes.html.includes(data.contentType)) {
      // todo: separate html parsing from url prefixing
      const rewriter = new RewritingStream();
      rewriter.on("startTag", (startTag) => {
        if (startTag.tagName === "meta") {
          // e.g. <META HTTP-EQUIV="Refresh" CONTENT="0;URL=/proxy/http://example.com/example/path">
          if (
            startTag.attrs.some(
              (attr) =>
                attr.name === "http-equiv" &&
                attr.value.toLowerCase() === "refresh"
            )
          ) {
            startTag.attrs.forEach((attr) => {
              if (attr.name === "content") {
                let position = attr.value.toLowerCase().indexOf("url=");
                if (position != -1) {
                  position += 4; // for "url=""
                  const start = attr.value.substr(0, position);
                  const url = attr.value.substr(position);
                  attr.value = start + fixUrl(url, data.url);
                }
              }
            });
          }
        }

        // todo separate style fixing from identification
        startTag.attrs.forEach((attr) => {
          if (prefixAttrs.includes(attr.name) && urlNeedsFixed(attr.value)) {
            attr.value = fixUrl(attr.value, data.url);
          }
          if (attr.name === "style") {
            attr.value = rewriteUrls(
              attr.value,
              new URL(data.url),
              config.prefix
            );
          }
          // todo: consider rewriting other things that look like URLs (?)
        });

        // todo: make this an event
        if (startTag.tagName === "style" && !startTag.selfClosing) {
          expectingCSS = true;
        } else if (
          startTag.tagName === "script" &&
          !startTag.selfClosing &&
          // ignore <script type="application/ld+json"> and the like
          !startTag.attrs.some(
            (attr) =>
              attr.name === "src" ||
              (attr.name === "type" && attr.value.includes("json"))
          )
        ) {
          expectingJS = true;
        }

        rewriter.emitStartTag(startTag);
      });

      rewriter.on("endTag", (endTag) => {
        if (endTag.tagName === "style") {
          expectingCSS = false;
        }
        if (endTag.tagName === "script") {
          expectingJS = false;
        }
        rewriter.emitEndTag(endTag);
      });

      rewriter.on("text", (textNode) => {
        if (expectingCSS && expectingJS) {
          debug(
            "ut-oh, this text node is going to be processed as both CSS and JS"
          );
        }
        // todo: make these into events to decouple them from html parsing (and url prefixing)
        if (expectingCSS) {
          expectingCSS = false; // todo: double-check that we can't get more than one of these per tag
          textNode.text = rewriteUrls(
            textNode.text,
            new URL(data.url),
            config.prefix
          );
        }
        if (expectingJS) {
          expectingJS = false; // todo: double-check that we can't get more than one of these nodes per <script> tag
          // bypass emitText due to https://github.com/inikulin/parse5/issues/339
          const proxiedSrc = proxyScriptSync(textNode.text, data.url);
          return rewriter.push(proxiedSrc);
        }
        rewriter.emitText(textNode);
      });

      data.stream = data.stream.pipe(rewriter);
    } else if (contentTypes.css.includes(data.contentType)) {
      debug("prefixing all urls with %s", config.prefix);
      data.stream = data.stream.pipe(createStream(data.url));
    }
  }

  prefixUrls.rewriteUrls = rewriteUrls; // for testing
  prefixUrls.createStream = createStream;

  return prefixUrls;
}

module.exports = urlPrefixer;
