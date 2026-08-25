"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { getData, streamToString } = require("./test_utils.js");
const defaultConfig = require("../lib/unblocker").defaultConfig;
const metaRobots = require("../lib/meta-robots.js");

const head = "<html><head><title>test</title></head>";
const body = "<body><p>asdf</p></body></html>";

test("should add a meta tag to the head", async () => {
  const expected = `<html><head><title>test</title><meta name="ROBOTS" content="NOINDEX, NOFOLLOW"/>
</head>`;
  const stream = metaRobots().createStream();
  stream.setEncoding("utf8");
  stream.end(head);
  const actual = await streamToString(stream);
  assert.strictEqual(actual, expected);
});

test("should do nothing to the body", async () => {
  const expected = body;
  const stream = metaRobots().createStream();
  stream.setEncoding("utf8");
  stream.end(body);
  const actual = await streamToString(stream);
  assert.strictEqual(actual, expected);
});

test("should not modify javascript", async () => {
  const config = Object.assign({}, defaultConfig);
  const instance = metaRobots(config);
  const data = getData();
  data.contentType = "text/javascript";
  const streamStart = data.stream;
  streamStart.setEncoding("utf8");
  instance(data); // this will replace data.stream when modifying the contents
  const streamEnd = data.stream;

  // commented out so that we can test the results rather than the implimentation details
  //t.equal(streamStart, streamEnd);

  const js = `document.write('${head}')`;
  const expected = js;

  streamEnd.setEncoding("utf8");
  streamStart.end(js);
  const actual = await streamToString(streamEnd);
  assert.strictEqual(actual, expected);
});
