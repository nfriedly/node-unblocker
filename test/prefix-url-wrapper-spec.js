"use strict";

const it = require("tap").test;
const PrefixUrlWrapper = require("../lib/prefix-url-wrapper.js");

const config = {
  host: "localhost:8080",
  prefix: "/proxy/",
};

const urlWrapper = new PrefixUrlWrapper(config);

it("should extract the url", function (t) {
  t.equal(
    urlWrapper.unwrap("/proxy/http://example.com/"),
    "http://example.com/"
  );
  t.end();
});

it("should extract incomplete urls", function (t) {
  t.equal(urlWrapper.unwrap("/proxy/example.com/"), "example.com/");
  t.end();
});

// todo: make it recover incomplete urls

it("should keep querystring data", function (t) {
  t.equal(
    urlWrapper.unwrap("/proxy/http://example.com/?foo=bar"),
    "http://example.com/?foo=bar"
  );
  t.end();
});

it("should should identify merged slashes as invalid (http:/ instead of http://)", function (t) {
  t.equal(urlWrapper.isValid("/proxy/http:/example.com/"), false);
  t.equal(urlWrapper.isValid("/proxy/https:/example.com/"), false);
  t.end();
});

it("should should recover merged slashes (http:/ instead of http://)", function (t) {
  t.equal(
    urlWrapper.recover({ url: "/proxy/http:/example.com/" }),
    "http://example.com/"
  );
  t.equal(
    urlWrapper.recover({ url: "/proxy/https:/example.com/" }),
    "https://example.com/"
  );
  t.end();
});

it("should identify double-prefixed urls as invalid", function (t) {
  t.equal(urlWrapper.isValid("/proxy/http://proxy/http://example.com/"), false);
  t.equal(urlWrapper.isValid("/proxy/http:/proxy/http://example.com/"), false);
  t.equal(
    urlWrapper.isValid("/proxy/https://proxy/https://example.com/"),
    false
  );
  t.end();
});

it("should recover double-prefixed urls", function (t) {
  t.equal(
    urlWrapper.recover({ url: "/proxy/http://proxy/http://example.com/" }),
    "http://example.com/"
  );
  t.equal(
    urlWrapper.recover({ url: "/proxy/http:/proxy/http://example.com/" }),
    "http://example.com/"
  );
  t.equal(
    urlWrapper.recover({ url: "/proxy/https://proxy/https://example.com/" }),
    "https://example.com/"
  );
  t.end();
});

it("should recover from the referer", function (t) {
  t.equal(
    urlWrapper.recover({
      url: "/",
      headers: {
        referer: urlWrapper.wrapAbsolute("http://example.com/foo/bar?baz"),
      },
    }),
    "http://example.com/"
  );
  t.equal(
    urlWrapper.recover({
      url: "/bar?baz",
      headers: { referer: urlWrapper.wrapAbsolute("http://example.com/foo/") },
    }),
    "http://example.com/bar?baz"
  );
  t.end();
});

it("should not incorrectly recover when from referred a different site", function (t) {
  t.equal(
    urlWrapper.recover({
      url: "/",
      headers: { referer: "http://example.com/foo/bar?baz" },
    }),
    null
  );
  t.equal(
    urlWrapper.recover({
      url: "/bar?baz",
      headers: { referer: "http://example.com/foo/" },
    }),
    null
  );
  t.end();
});
