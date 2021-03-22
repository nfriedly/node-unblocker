import tap from "tap";
import { fixUrl } from "../../lib/client/fix-url.mjs";
const { test } = tap;
const proxy = "http://localhost";
const prefix = "/proxy/";
const target = "http://example.com/page.html?query#hash";
const location = new URL(proxy + prefix + target);

// 1x1 transparent gif
const pixel =
  " data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

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
  // todo: port numbers
  // todo: more https tests
  // todo: websockets(?)
  // todo: already proxied input url
];

testCases.forEach((tc) => {
  test(JSON.stringify(tc), (t) => {
    // todo: replace || with ??
    const actual = fixUrl(tc.url, tc.prefix || prefix, tc.location || location);
    t.equal(actual, tc.expected);
    t.end();
  });
});

// todo: something about cookies and subdomains
