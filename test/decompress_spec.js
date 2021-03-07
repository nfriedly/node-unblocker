"use strict";

var PassThrough = require("stream").PassThrough;
var zlib = require("zlib");
var test = require("tap").test;
var concat = require("concat-stream");
var decompress = require("../lib/decompress.js");
var defaultConfig = require("../lib/unblocker.js").defaultConfig;

test("should decompress data compressed with gzip", function (t) {
  var source = zlib.createGzip();
  var data = {
    remoteResponse: {
      statusCode: 200,
    },
    headers: {
      "content-encoding": "gzip",
    },
    contentType: "text/html",
    stream: source,
  };
  var content = "this is some content to compress and decompress";
  var expected = content;

  decompress(defaultConfig).handleResponse(data);

  t.notEqual(
    source,
    data.stream,
    "it should create a new stream for decompression"
  );

  t.notOk(
    data.headers["content-encoding"],
    "it should remove the encoding header when decompressing"
  );

  data.stream.pipe(
    concat(function (data) {
      var actual = data.toString();
      t.same(actual, expected);
      t.end();
    })
  );

  source.end(content);
});

test("should decompress data compressed with deflate", function (t) {
  var source = zlib.createDeflate();
  var data = {
    remoteResponse: {
      statusCode: 200,
    },
    headers: {
      "content-encoding": "deflate",
    },
    contentType: "text/html",
    stream: source,
  };
  var content = "this is some content to compress and decompress";
  var expected = content;

  decompress(defaultConfig).handleResponse(data);

  t.notEqual(
    source,
    data.stream,
    "it should create a new stream for decompression"
  );

  t.notOk(
    data.headers["content-encoding"],
    "it should remove the encoding header when decompressing"
  );

  data.stream.pipe(
    concat(function (data) {
      var actual = data.toString();
      t.same(actual, expected);
      t.end();
    })
  );

  source.end(content);
});

test("should skip requests with no content (#105)", function (t) {
  var source = new PassThrough();
  var data = {
    remoteResponse: {
      statusCode: 304,
    },
    headers: {
      "content-encoding": "gzip",
    },
    contentType: "text/html",
    stream: source,
  };

  decompress(defaultConfig).handleResponse(data);

  t.equal(
    data.headers["content-encoding"],
    "gzip",
    "it should keep the encoding header when skipping"
  );

  t.equal(
    source,
    data.stream,
    "it should not change the stream when it can tell there's no content"
  );
  t.end();
});

test("should skip requests with no content, even if it can't tell ahead of time", function (t) {
  var source = new PassThrough();
  var data = {
    remoteResponse: {
      statusCode: 200,
    },
    headers: {
      "content-encoding": "gzip",
    },
    contentType: "text/html",
    stream: source,
  };

  decompress(defaultConfig).handleResponse(data);

  t.notEqual(
    source,
    data.stream,
    "it should create a new stream for decompression"
  );

  data.stream.on("end", function () {
    t.end();
  });

  data.stream.resume(); // put the stream into flowing mode so that 'end' fires
  source.end();
});

test("should request only gzip if the client supports multiple encodings (#151)", function (t) {
  var data = {
    headers: {
      "accept-encoding": "deflate, gzip",
    },
  };

  decompress(defaultConfig).handleRequest(data);

  t.equal(
    data.headers["accept-encoding"],
    "gzip",
    "it should change the header to gzip only"
  );
  t.end();
});

test("should remove the accept-encoding header if the client does not support gzip", function (t) {
  var data = {
    headers: {
      "accept-encoding": "deflate",
    },
  };

  decompress(defaultConfig).handleRequest(data);

  t.notOk(
    data.headers["accept-encoding"],
    "it should remove unsupported encodings"
  );
  t.end();
});
