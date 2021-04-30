"use strict";

const { test } = require("tap");
const { getContext } = require("./test_utils");
const redirect = require("../lib/redirects.js");

const _proxyUrl = new URL("http://localhost:8080/proxy/");

test("should correctly redirect with http://", function (t) {
  const expected = "http://localhost:8080/proxy/http://example.com/not-a-test/";
  const context = getContext({
    url: "http://example.com/test/",
    headers: {
      location: "http://example.com/not-a-test/",
    },
    _proxyUrl,
  });
  redirect(context);
  t.equal(context.headers.location, expected);
  t.end();
});

test("should correctly redirect with //", function (t) {
  const expected = "http://localhost:8080/proxy/http://example.com/not-a-test/";
  const context = getContext({
    url: "http://example.com/test/",
    headers: {
      location: "//example.com/not-a-test/",
    },
    _proxyUrl,
  });
  redirect(context);
  t.equal(context.headers.location, expected);
  t.end();
});

test("should correctly redirect with // and https", function (t) {
  const expected =
    "http://localhost:8080/proxy/https://example.com/not-a-test/";
  const context = getContext({
    url: "https://example.com/test/",
    headers: {
      location: "//example.com/not-a-test/",
    },
    _proxyUrl,
  });
  redirect(context);
  t.equal(context.headers.location, expected);
  t.end();
});
