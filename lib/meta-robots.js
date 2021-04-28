"use strict";

module.exports = function (/* config */) {
  function metaRobots(context) {
    if (context.html) {
      context.html.on("endTag", (e) => {
        if (e.endTag.tagName === "head") {
          e.insertBefore('<meta name="ROBOTS" content="NOINDEX, NOFOLLOW"/>\n');
        }
      });
    }
  }

  return metaRobots;
};
