"use strict";
const { test } = require("tap");
const prefix = "/proxy/";
const proxy = "http://localhost";
const target = "http://example.com/page.html?query#hash";
const location = new URL(proxy + prefix + target);

const config = (global.unblocker = { prefix, url: target });
const { fixUrl } = require("../lib/client/unblocker-client.js");

// 1x1 transparent gif
const pixel =
  " data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

// test cases for fixUrl
const testCases = [
  { url: "http://foo.com/", expected: "/proxy/http://foo.com/" },
  { url: "/bar", expected: "/proxy/http://example.com/bar" },
  { url: "baz", expected: "/proxy/http://example.com/baz" },
  {
    url: "/bar",
    location: new URL(proxy + prefix + "http://example.com/bam/biz"),
    expected: "/proxy/http://example.com/bar",
  },
  {
    url: "baz",
    location: new URL(proxy + prefix + "http://example.com/bam/biz"),
    expected: "/proxy/http://example.com/bam/baz",
  },
  {
    url: "../parent",
    location: new URL(proxy + prefix + "http://example.com/foo/bar/"),
    expected: "/proxy/http://example.com/foo/parent",
  },
  { url: "../too-high", expected: "/proxy/http://example.com/too-high" },
  { url: "#", expected: "/proxy/http://example.com/page.html?query#" },
  { url: "https://example.com/", expected: "/proxy/https://example.com/" },
  // this is for when website js tries to be clever and use location.protocol + location.host + a new path.
  { url: "http://localhost/path", expected: "/proxy/http://example.com/path" },
  // don't break data: urls
  { url: pixel, expected: pixel },
  // don't break protocol-relative urls
  { url: "//example.com/foo", expected: "/proxy/http://example.com/foo" },
  // don't break about:blank urls
  { url: "about:blank", expected: "about:blank" },
  // don't break already proxied URLs
  {
    url: proxy + prefix + "http://example.com/foo",
    expected: proxy + prefix + "http://example.com/foo",
  },
  {
    url: prefix + "http://example.com/foo",
    expected: prefix + "http://example.com/foo",
  },
  // todo: port numbers
  // todo: more https tests
  // todo: websockets(?)
];

testCases.forEach((tc) => {
  test("fixUrl - " + JSON.stringify(tc), (t) => {
    // todo: replace || with ??
    const actual = fixUrl(tc.url, tc.config || config, tc.location || location);
    t.equal(actual, tc.expected);
    t.end();
  });
});

// todo: something about cookies and subdomains
