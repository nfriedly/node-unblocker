"use strict";

const { test } = require("tap");
const { getContext } = require("./test_utils");
const referer = require("../lib/referer.js");

test("should correctly rewrite referers", function (t) {
  const expected = "http://foobar.com/proxy/a";
  const context = getContext({
    url: "http://foobar.com/b",
    headers: {
      referer: "http://localhost:8080/proxy/" + expected,
    },
    _proxyUrl: new URL("http://localhost:8080/proxy/"),
  });
  referer(context);
  t.equal(context.headers.referer, expected);
  t.end();
});
