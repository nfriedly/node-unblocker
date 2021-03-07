"use strict";

var test = require("tap").test,
  concat = require("concat-stream"),
  utils = require("./test_utils.js"),
  getData = utils.getData,
  defaultConfig = require("../lib/unblocker").defaultConfig;

var metaRobots = require("../lib/meta-robots.js");

var head = "<html><head><title>test</title></head>";
var body = "<body><p>asdf</p></body></html>";

test("should add a meta tag to the head", function (t) {
  var expected =
    '<html><head><title>test</title><meta name="ROBOTS" content="NOINDEX, NOFOLLOW"/>\n</head>';
  var stream = metaRobots().createStream();
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
  var expected = body;
  var stream = metaRobots().createStream();
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
  var config = Object.assign({}, defaultConfig);
  var instance = metaRobots(config);
  var data = getData();
  data.contentType = "text/javascript";
  var streamStart = data.stream;
  streamStart.setEncoding("utf8");
  instance(data); // this will replace data.stream when modifying the contents
  var streamEnd = data.stream;

  // commented out so that we can test the results rather than the implimentation details
  //t.equal(streamStart, streamEnd);

  var js = `document.write('${head}')`;
  var expected = js;

  streamEnd.setEncoding("utf8");
  streamEnd.pipe(
    concat(function (actual) {
      t.equal(actual, expected);
      t.end();
    })
  );
  streamStart.end(js);
});
