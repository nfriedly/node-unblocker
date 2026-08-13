"use strict";

const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const zlib = require("node:zlib");
const { test } = require("node:test");
const { streamToString } = require("./test_utils.js");
const decompress = require("../lib/decompress.js");
const defaultConfig = require("../lib/unblocker.js").defaultConfig;

test("should decompress data compressed with gzip", async () => {
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

  decompress(defaultConfig).handleResponse(data);

  assert.notStrictEqual(
    source,
    data.stream,
    "it should create a new stream for decompression"
  );
  assert.ok(
    !data.headers["content-encoding"],
    "it should remove the encoding header when decompressing"
  );

  source.end(content);
  const actual = await streamToString(data.stream);
  assert.strictEqual(actual, expected);
});

test("should decompress data compressed with deflate", async () => {
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

  decompress(defaultConfig).handleResponse(data);

  assert.notStrictEqual(
    source,
    data.stream,
    "it should create a new stream for decompression"
  );
  assert.ok(
    !data.headers["content-encoding"],
    "it should remove the encoding header when decompressing"
  );

  source.end(content);
  const actual = await streamToString(data.stream);
  assert.strictEqual(actual, expected);
});

test("should skip requests with no content (#105)", () => {
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

  decompress(defaultConfig).handleResponse(data);

  assert.strictEqual(
    data.headers["content-encoding"],
    "gzip",
    "it should keep the encoding header when skipping"
  );
  assert.strictEqual(
    source,
    data.stream,
    "it should not change the stream when it can tell there's no content"
  );
});

test("should skip requests with no content, even if it can't tell ahead of time", async () => {
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

  decompress(defaultConfig).handleResponse(data);

  assert.notStrictEqual(
    source,
    data.stream,
    "it should create a new stream for decompression"
  );

  data.stream.resume(); // put the stream into flowing mode so that 'end' fires
  source.end();
  await new Promise((resolve) => data.stream.on("end", resolve));
});

test("should request only gzip if the client supports multiple encodings (#151)", () => {
  const data = {
    headers: {
      "accept-encoding": "deflate, gzip",
    },
  };

  decompress(defaultConfig).handleRequest(data);

  assert.strictEqual(
    data.headers["accept-encoding"],
    "gzip",
    "it should change the header to gzip only"
  );
});

test("should remove the accept-encoding header if the client does not support gzip", () => {
  const data = {
    headers: {
      "accept-encoding": "deflate",
    },
  };

  decompress(defaultConfig).handleRequest(data);

  assert.ok(
    !data.headers["accept-encoding"],
    "it should remove unsupported encodings"
  );
});
