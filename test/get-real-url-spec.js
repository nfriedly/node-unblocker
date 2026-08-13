"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const getRealUrl = require("../lib/get-real-url.js");

const config = {
  prefix: "/proxy/",
};

const instance = getRealUrl(config);

test("should extract the url", () => {
  assert.strictEqual(
    instance("/proxy/http://example.com/"),
    "http://example.com/"
  );
});

test("should extract incpmplete urls", () => {
  assert.strictEqual(instance("/proxy/example.com/"), "example.com/");
});

test("should keep querystring data", () => {
  assert.strictEqual(
    instance("/proxy/http://example.com/?foo=bar"),
    "http://example.com/?foo=bar"
  );
});

test("should should fix merged slashes (http:/ instead of http://", () => {
  assert.strictEqual(
    instance("/proxy/http:/example.com/"),
    "http://example.com/"
  );
  assert.strictEqual(
    instance("/proxy/https:/example.com/"),
    "https://example.com/"
  );
});

test("should fix double-prefixed urls)", () => {
  assert.strictEqual(
    instance("/proxy/http://proxy/http://example.com/"),
    "http://example.com/"
  );
  assert.strictEqual(
    instance("/proxy/http:/proxy/http://example.com/"),
    "http://example.com/"
  );
  assert.strictEqual(
    instance("/proxy/https://proxy/https://example.com/"),
    "https://example.com/"
  );
});
