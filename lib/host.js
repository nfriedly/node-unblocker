"use strict";

module.exports = function hostHeader(data) {
  data.headers.host = data.url.host;
  if (data.headers.origin) {
    data.headers.origin = data.url.origin;
  }
};
