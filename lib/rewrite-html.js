"use strict";

// todo: update description
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

//const debug = require("debug")("unblocker:html-rewriter");]

function htmlRewriter(/*config*/) {
  // todo: add a video tag with a poster to the tests
  const prefixAttrs = ["src", "href", "action", "formaction", "poster"];

  function handleResponse(data) {
    if (data.html) {
      data.html.on("startTag", ({ startTag }) => {
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
                  attr.value = start + data.urlWrapper.wrap(url);
                }
              }
            });
          }
        }

        startTag.attrs.forEach((attr) => {
          if (prefixAttrs.includes(attr.name)) {
            attr.value = data.urlWrapper.wrap(attr.value);
          }
          // todo: srcset
          // todo: consider rewriting other things that look like URLs (?)
        });
      });
    }
  }

  return handleResponse;
}

module.exports = htmlRewriter;
