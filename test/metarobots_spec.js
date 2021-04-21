"use strict";

const { test } = require("tap");
const concat = require("concat-stream");
const utils = require("./test_utils.js");
const { getContext } = utils;
const { defaultConfig } = require("../lib/unblocker");

const metaRobots = require("../lib/meta-robots.js");

const head = "<html><head><title>test</title></head>";
const body = "<body><p>asdf</p></body></html>";

test("should add a meta tag to the head", function (t) {
  const expected =
    '<html><head><title>test</title><meta name="ROBOTS" content="NOINDEX, NOFOLLOW"/>\n</head>';
  const stream = metaRobots().createStream();
  stream.setEncoding("utf8");
  stream.pipe(
    concat(function (actual) {
      t.equal(actual, expected);
      t.end();
    })
  );
  stream.end(head);
});

test("should do nothing to the body", function (t) {
  const expected = body;
  const stream = metaRobots().createStream();
  stream.setEncoding("utf8");
  stream.pipe(
    concat(function (actual) {
      t.equal(actual, expected);
      t.end();
    })
  );
  stream.end(body);
});

test("should not modify javascript", function (t) {
  const config = Object.assign({}, defaultConfig);
  const instance = metaRobots(config);
  const data = getContext();
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
  streamEnd.pipe(
    concat(function (actual) {
      t.equal(actual, expected);
      t.end();
    })
  );
  streamStart.end(js);
});
