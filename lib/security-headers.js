"use strict";

//const debug = require("debug")("unblocker:security-headers");

/**
 * This is kind of an anti-helmet module. It deletes a lot of security headers that could break the proxy
 */

const headersToDelete = [
  // this can break js and css and other content
  "content-security-policy",
  // this one is just annoying
  "content-security-policy-report-only",

  // this could potentially block clients from using the proxy successfully by messing with https certificates
  "public-key-pins",
  "expect-ct",

  // this leaks to all sites that are visited by the client & it can block the client from accessing the proxy if https is not available.
  "strict-transport-security",
];

module.exports = function securityHeaders(context) {
  for (const header of headersToDelete) {
    delete context.headers[header];
  }
};
