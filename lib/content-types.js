"use strict";
var contentType = require("content-type");

var html = ["text/html", "application/xml+xhtml", "application/xhtml+xml"];
var css = ["text/css"];
var javascript = [
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
];

function shouldProcess(config, data) {
  return config.processContentTypes.indexOf(data.contentType) != -1;
}

function parse(data) {
  try {
    return contentType.parse(data.headers["content-type"]);
  } catch (ex) {
    return {
      type: "",
      parameters: {},
    };
  }
}

function setHeader(data) {
  var type = getType(data);
  if (type) {
    data.headers["content-type"] = contentType.format({
      type: getType(data),
      parameters: {
        charset: "UTF-8",
      },
    });
  }
}

function getType(data) {
  return parse(data).type;
}

function getCharset(data) {
  return parse(data).parameters.charset;
}

module.exports.shouldProcess = shouldProcess;
module.exports.getType = getType;
module.exports.getCharset = getCharset;
module.exports.setHeader = setHeader;
module.exports.html = html;
module.exports.css = css;
module.exports.js = javascript;
module.exports.javascript = javascript; // for backwards-compatibility
