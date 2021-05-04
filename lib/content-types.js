"use strict";
var contentType = require("content-type");

var html = ["text/html", "application/xml+xhtml", "application/xhtml+xml"];
var xml=["text/xml"]
var ts=["video/mp2t"]
var z["application/x-7z-compressed"]
var csv=["text/csv"]
var ttf=["font/ttf"]
var php=["application/x-httpd-php"]
var doc=["application/msword"]
var weba=["audio/webm"]
var webp=["image/webp"]
var css = ["text/css"];
var rar=["application/vnd.rar"]
var json=["application/json","text/x-json"];
var text=["text/plain"]
var woff=["font/woff"]
var gz=["appliction/gzip"]
var woff2=["font/woff2"]
var xls=["application/vnd.ms-excel"]
var 3g2["video/3gpp2"]
var zip=["application/zip"]
var epub=["application/ebup+zip"]
var gif=["image/gif"]
var jar=["application/java-archive"]
var ics=["text/calender"]
var typescript=["application/x-typescript"]
var javascript = [
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
  "text/javascript+module",
  "application/javascript+module",
  "text/jsscript",
  "text/vbscript",
  "TeXt/jaVaScRiPt",
  "text/ecmascript",
  "text/fluffscript",
  "application/ecmascript",
  "foo/bar"
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
module.exports.json=json
module.exports.csv=csv
module.exports.ttf=ttf
module.exports.weba=weba
module.exports.ts=ts
module.exports.typescript=typescript
module.exports.epub=epub
module.exports.7z=z
module.exports.gzip=gz
module.exports.ics=ics
module.exports.jar=jar
module.exports.doc=doc
module.exports.php=php
module.exports.xls=xls

module.exports.gif=gif
module.exports.3g2=3g2
module.exports.webp=webp
module.exports.zip=zip
module.exports.rar=rar
module.exports.woff2=woff2
module.exports.xml=xml
module.exports.text=text
module.exports.css = css;
module.exports.js = javascript;
module.exports.javascript = javascript; // for backwards-compatibility
