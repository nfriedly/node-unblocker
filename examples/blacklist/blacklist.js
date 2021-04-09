"use strict";

module.exports = function ({ blockedDomains, message }) {
  function isRequestBlocked(data) {
    const { hostname } = data.url;
    return blockedDomains.some(
      (blockedDomain) =>
        hostname === blockedDomain || hostname.endsWith(`.${blockedDomain}`)
    );
  }

  function checkBlacklist(data) {
    if (isRequestBlocked(data)) {
      data.clientResponse.status(400).send(message);
    }
  }

  return checkBlacklist;
};
