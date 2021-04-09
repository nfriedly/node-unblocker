"use strict";

const referer = require("../lib/referer.js");
const { test } = require("tap");

test("should correctly rewrite referers", function (t) {
  const expected = "http://foobar.com/proxy/a";
  const data = {
    url: "http://foobar.com/b",
    headers: {
      referer: "http://localhost:8080/proxy/" + expected,
    },
  };
  referer({
    prefix: "/proxy/",
  })(data);
  t.equal(data.headers.referer, expected);
  t.end();
});
