"use strict";

var URL = require("url");

module.exports = function (config) {
  // occasionally things try to "fix" http:// in the path portion of the URL by merging the slashes and thereby breaking everything
  atob = str => new Buffer.from(str, 'base64').toString('utf-8')
  
   var getRealUrl = atob(req.query.url);
  return getRealUrl;
};
