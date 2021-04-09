"use strict";

module.exports = function (/*config*/) {
  return function hostHeader(data) {
    data.headers.host = data.url.host;
    if (data.headers.origin) {
      data.headers.origin = data.url.protocol + data.url.host;
    }
  };
};
