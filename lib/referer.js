"use strict";

const debug = require("debug")("proxyReferer");

module.exports = function (config) {
  function proxyReferer(data) {
    // overwrite the referer with the correct referer
    if (data.headers.referer) {
      const url = new URL(data.headers.referer, "http://referer.invalid");
      if (url.pathname.substr(0, config.prefix.length) == config.prefix) {
        const ref = url.pathname.substr(config.prefix.length) + url.search;
        // todo: querystring
        debug("rewriting referer from %s to %s", ref, data.headers.referer);
        data.headers.referer = ref;
      }
    }
  }

  // todo: fixup these
  // X-SPF-Previous: https://www.youtube.com/proxy/https://www.youtube.com/
  // X-SPF-Referer: https://www.youtube.com/proxy/https://www.youtube.com/

  return proxyReferer;
};
