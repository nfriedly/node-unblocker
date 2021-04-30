"use strict";

const { test } = require("tap");
const concat = require("concat-stream");
const utils = require("./test_utils.js");
const { getContext } = utils;
const htmlParser = require("../lib/html-parser");

const metaRobots = require("../lib/meta-robots.js");

const headStart = "<html><head><title>test</title>";
const headEnd = "</head>";
const head = headStart + headEnd;
const body = "<body><p>asdf</p></body></html>";

test("should add a meta tag to the head", function (t) {
  const expected =
    headStart +
    '<meta name="ROBOTS" content="NOINDEX, NOFOLLOW"/>\n' +
    headEnd +
    body;
  const context = getContext();
  const inStream = context.stream;
  inStream.setEncoding("utf8");
  htmlParser(context);
  metaRobots(context);
  const outStream = context.stream;
  outStream.setEncoding("utf8");
  outStream.pipe(
    concat(function (actual) {
      t.equal(actual, expected);
      t.end();
    })
  );
  inStream.write(head);
  inStream.end(body);
});

test("should do nothing to the body", function (t) {
  const expected = body;
  const context = getContext();
  const inStream = context.stream;
  inStream.setEncoding("utf8");
  htmlParser(context);
  metaRobots(context);
  const outStream = context.stream;
  outStream.setEncoding("utf8");
  outStream.pipe(
    concat(function (actual) {
      t.equal(actual, expected);
      t.end();
    })
  );
  inStream.end(body);
});

test("should not modify javascript", function (t) {
  const data = getContext();
  data.contentType = "text/javascript";
  const streamStart = data.stream;
  streamStart.setEncoding("utf8");
  metaRobots(data); // this will replace data.stream when modifying the contents
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
