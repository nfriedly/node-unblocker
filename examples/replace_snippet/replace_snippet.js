"use strict";

const Transform = require("stream").Transform;

// this isn't 100% reliable, but it will handle most cases
// see lib/url-prefixer.js for a version that handles things split across multiple chunks

module.exports = function (config) {
  function replaceSnippet(data) {
    if (config.processContentTypes.includes(data.contentType)) {
      data.stream = data.stream.pipe(
        new Transform({
          decodeStrings: false,
          transform: function (chunk, encoding, next) {
            const updated = chunk
              .toString()
              .replace(config.searchFor, config.replaceWith);
            this.push(updated, "utf8");
            next();
          },
        })
      );
    }
  }
  return replaceSnippet;
};
