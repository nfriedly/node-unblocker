"use strict";

const debug = require("debug")("unblocker:referer");

module.exports = function proxyReferer(context) {
  // tell browsers to send us the entire referer, so that we can use it to recover from broken links
  context.headers["referrer-policy"] = "unsafe-url";

  // overwrite the referer with the correct referer
  const ref = context.headers.referer;
  if (ref) {
    if (context.urlWrapper.isWrapped(ref)) {
      const unwrappedRef = context.urlWrapper.unwrap(ref);
      debug("rewriting referer from %s to %s", ref, unwrappedRef);
      context.headers.referer = unwrappedRef;
    }
  }

  // these both appear to be duplicates of the referer header
  // just deleting for now, although we could fix them up too
  delete context.headers["x-spf-previous"];
  delete context.headers["x-spf-referer"];
};
