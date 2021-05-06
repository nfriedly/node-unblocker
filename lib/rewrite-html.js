"use strict";

const srcset = require("srcset");
//const debug = require("debug")("unblocker:html-rewriter");

/**
 * This file hooks into events from the html parser to rewrite various urls that appear in html
 */

const wrapAttrs = ["src", "href", "action", "formaction", "poster"];

function rewriteHtml(ctx) {
  if (ctx.html) {
    ctx.html.on("startTag", ({ startTag }) => {
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
                attr.value = start + ctx.urlWrapper.wrap(url);
              }
            }
          });
        }
      }

      startTag.attrs.forEach((attr) => {
        if (wrapAttrs.includes(attr.name)) {
          const evt = {
            unwrapped: attr.value,
            wrapped: ctx.urlWrapper.wrap(attr.value),
          };
          // this event is used by the cookies.js to ensure cookies are correctly shared across protocols and subdomains
          ctx.html.emit("wrap", evt);
          attr.value = evt.wrapped;
        } else if (attr.name === "srcset") {
          try {
            let entries = srcset.parse(attr.value);
            entries = entries.map((entry) => {
              entry.url = ctx.urlWrapper.wrap(entry.url);
              return entry;
            });
            attr.value = srcset.stringify(entries);
          } catch (ex) {
            // if unable to parse, pass the value through as-is
          }
        }

        // todo: consider rewriting other things that look like URLs (?)
      });
    });
  }
}

module.exports = rewriteHtml;
