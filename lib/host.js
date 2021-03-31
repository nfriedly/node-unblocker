"use strict";

var URL = require("url");

module.exports = function (/*config*/) {
  return function hostHeader(data) {
    var url = URL.parse(data.url);
    data.headers.host = url.host;
    if (data.headers.origin) {
      data.headers.origin = url.protocol + url.host;
    }
  };
};
