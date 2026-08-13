"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const referer = require("../lib/referer.js");

test("should correctly rewrite referers", () => {
  const expected = "http://foobar.com/proxy/a";
  const data = {
    url: "http://foobar.com/b",
    headers: {
      referer: "http://localhost:8080/proxy/" + expected,
    },
  };
  referer({ prefix: "/proxy/" })(data);
  assert.strictEqual(data.headers.referer, expected);
});
