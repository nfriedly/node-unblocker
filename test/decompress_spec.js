"use strict";

const { PassThrough } = require("stream");
const zlib = require("zlib");
const { test } = require("tap");
const concat = require("concat-stream");
const decompress = require("../lib/decompress.js");
const config = { processContentTypes: ["text/html"] };

test("should decompress data compressed with gzip", function (t) {
  const source = zlib.createGzip();
  const data = {
    remoteResponse: {
      statusCode: 200,
    },
    headers: {
      "content-encoding": "gzip",
    },
    contentType: "text/html",
    stream: source,
  };
  const content = "this is some content to compress and decompress";
  const expected = content;

  decompress(config).handleResponse(data);

  t.not(source, data.stream, "it should create a new stream for decompression");

  t.notOk(
    data.headers["content-encoding"],
    "it should remove the encoding header when decompressing"
  );

  data.stream.pipe(
    concat(function (data) {
      const actual = data.toString();
      t.same(actual, expected);
      t.end();
    })
  );

  source.end(content);
});

test("should decompress data compressed with deflate", function (t) {
  const source = zlib.createDeflate();
  const data = {
    remoteResponse: {
      statusCode: 200,
    },
    headers: {
      "content-encoding": "deflate",
    },
    contentType: "text/html",
    stream: source,
  };
  const content = "this is some content to compress and decompress";
  const expected = content;

  decompress(config).handleResponse(data);

  t.not(source, data.stream, "it should create a new stream for decompression");

  t.notOk(
    data.headers["content-encoding"],
    "it should remove the encoding header when decompressing"
  );

  data.stream.pipe(
    concat(function (data) {
      const actual = data.toString();
      t.same(actual, expected);
      t.end();
    })
  );

  source.end(content);
});

test("should skip requests with no content (#105)", function (t) {
  const source = new PassThrough();
  const data = {
    remoteResponse: {
      statusCode: 304,
    },
    headers: {
      "content-encoding": "gzip",
    },
    contentType: "text/html",
    stream: source,
  };

  decompress(config).handleResponse(data);

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
  const source = new PassThrough();
  const data = {
    remoteResponse: {
      statusCode: 200,
    },
    headers: {
      "content-encoding": "gzip",
    },
    contentType: "text/html",
    stream: source,
  };

  decompress(config).handleResponse(data);

  t.not(source, data.stream, "it should create a new stream for decompression");

  data.stream.on("end", function () {
    t.end();
  });

  data.stream.resume(); // put the stream into flowing mode so that 'end' fires
  source.end();
});

test("should request only gzip if the client supports multiple encodings (#151)", function (t) {
  const data = {
    headers: {
      "accept-encoding": "deflate, gzip",
    },
  };

  decompress(config).handleRequest(data);

  t.equal(
    data.headers["accept-encoding"],
    "gzip",
    "it should change the header to gzip only"
  );
  t.end();
});

test("should remove the accept-encoding header if the client does not support gzip", function (t) {
  const data = {
    headers: {
      "accept-encoding": "deflate",
    },
  };

  decompress(config).handleRequest(data);

  t.notOk(
    data.headers["accept-encoding"],
    "it should remove unsupported encodings"
  );
  t.end();
});
