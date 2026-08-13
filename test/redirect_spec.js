"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const redirect = require("../lib/redirects.js");

test("should correctly redirect with http://", () => {
  const expected = "http://foobar.com/proxy/http://example.com/not-a-test/";
  const data = {
    url: "http://example.com/test/",
    headers: {
      location: "http://example.com/not-a-test/",
    },
    clientRequest: {
      thisSite() {
        return "http://foobar.com/proxy/";
      },
    },
  };
  redirect()(data);
  assert.strictEqual(data.headers.location, expected);
});

test("should correctly redirect with //", () => {
  const expected = "http://foobar.com/proxy/http://example.com/not-a-test/";
  const data = {
    url: "http://example.com/test/",
    headers: {
      location: "//example.com/not-a-test/",
    },
    clientRequest: {
      thisSite() {
        return "http://foobar.com/proxy/";
      },
    },
  };
  redirect()(data);
  assert.strictEqual(data.headers.location, expected);
});

test("should correctly redirect with // and https", () => {
  const expected = "http://foobar.com/proxy/https://example.com/not-a-test/";
  const data = {
    url: "https://example.com/test/",
    headers: {
      location: "//example.com/not-a-test/",
    },
    clientRequest: {
      thisSite() {
        return "http://foobar.com/proxy/";
      },
    },
  };
  redirect()(data);
  assert.strictEqual(data.headers.location, expected);
});
