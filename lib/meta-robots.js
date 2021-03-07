"use strict";

var Transform = require("stream").Transform;
var contentTypes = require("./content-types");

module.exports = function (/* config */) {
  function createStream() {
    return new Transform({
      decodeStrings: false,
      transform: function (chunk, encoding, next) {
        var updated = chunk
          .toString()
          .replace(
            "</head>",
            '<meta name="ROBOTS" content="NOINDEX, NOFOLLOW"/>\n</head>'
          );
        this.push(updated, "utf8");
        next();
      },
    });
  }

  function metaRobots(data) {
    // intentialonally ignoring config.processContentTypes and only processing HTML  - see #154
    if (contentTypes.html.indexOf(data.contentType) != -1) {
      data.stream = data.stream.pipe(createStream());
    }
  }

  metaRobots.createStream = createStream; // for testing

  return metaRobots;
};
