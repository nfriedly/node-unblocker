"use strict";

const debug = require("debug")("unblocker:redirects");

module.exports = function proxyRedirects(context) {
  if (context.headers.location) {
    const location = context.urlWrapper.wrapAbsolute(context.headers.location);

    debug(
      "rewriting redirect from %s to %s",
      context.headers.location,
      location
    );
    context.headers.location = location;
  }
};
