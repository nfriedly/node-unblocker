"use strict";

const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const { test } = require("node:test");
const { getData, pipeToString } = require("./test_utils.js");
const cookies = require("../lib/cookies.js");

test("should copy cookies and redirect in response to a __proxy_cookies_to query param", async () => {
  const instance = cookies({
    prefix: "/proxy/",
    processContentTypes: [],
  });
  const data = getData();
  data.url += "?__proxy_cookies_to=https%3A%2F%2Fexample.com%2F";
  data.headers.cookie = "one=1; two=2; three=3";

  await new Promise((resolve) => {
    data.clientResponse = {
      redirectTo(path, headers) {
        const expectedPath = "https://example.com/";
        const expectedHeaders = {
          "set-cookie": [
            "one=1; Path=/proxy/https://example.com/",
            "two=2; Path=/proxy/https://example.com/",
            "three=3; Path=/proxy/https://example.com/",
          ],
        };
        assert.strictEqual(path, expectedPath);
        assert.deepStrictEqual(headers, expectedHeaders);
        resolve();
      },
    };

    instance.handleRequest(data);
  });
});

test("should rewrite set-cookie paths", () => {
  const instance = cookies({
    prefix: "/proxy/",
    processContentTypes: [],
  });
  const data = getData();
  data.headers["set-cookie"] = ["one=1", "two=2; path=/", "three=3; path=/foo"];
  instance.handleResponse(data);
  const expected = [
    "one=1; Path=/proxy/http://example.com/",
    "two=2; Path=/proxy/http://example.com/",
    "three=3; Path=/proxy/http://example.com/foo",
  ];
  const actual = data.headers["set-cookie"];
  assert.deepStrictEqual(actual, expected);
});

test("should rewrite the cookie that is percent-encoded correctly", () => {
  const instance = cookies({
    prefix: "/proxy/",
    processContentTypes: [],
  });
  const data = getData();
  data.headers["set-cookie"] = [
    "asdf=asdf%3Basdf%3Dtrue%3Basdf%3Dasdf%3Basdf%3Dtrue%40asdf",
  ];
  instance.handleResponse(data);
  const expected = [
    "asdf=asdf%3Basdf%3Dtrue%3Basdf%3Dasdf%3Basdf%3Dtrue%40asdf; Path=/proxy/http://example.com/",
  ];
  const actual = data.headers["set-cookie"];
  assert.deepStrictEqual(actual, expected);
});

test("should copy any missing cookies to a 3xx redirect", () => {
  const instance = cookies({
    prefix: "/proxy/",
    processContentTypes: ["text/html"],
  });
  const data = getData();
  data.clientRequest = {
    headers: {
      cookie: "one=oldvalue; two=2",
    },
  };
  data.headers = {
    "set-cookie": "one=1; Path=/; HttpOnly",
  };
  data.redirectUrl = "https://example.com/"; // this is normally set by the redirects middleware before it changes the location header
  instance.handleResponse(data);
  const expected = {
    "set-cookie": [
      "one=1; Path=/proxy/https://example.com/; HttpOnly",
      "two=2; Path=/proxy/https://example.com/",
    ],
  };
  assert.deepStrictEqual(data.headers, expected);
});

test("should rewrite urls that change subdomain or protocol (but not domain)", async () => {
  const instance = cookies({
    prefix: "/proxy/",
    processContentTypes: ["text/html"],
  });
  const data = getData();
  const sourceStream = new PassThrough({ encoding: "utf8" });
  data.stream = sourceStream;
  instance.handleResponse(data);
  assert.notStrictEqual(
    data.stream,
    sourceStream,
    "cookies.handleResponse should create a new stream to process content"
  );

  const source = [
    '<a href="/proxy/http://example.com/">no change</a>',
    '<a href="/proxy/https://example.com/">new proto</a>',
    '<a href="/proxy/http://sub.example.com/">new subdomain</a>',
    '<a href="/proxy/http://othersite.com/">other site, same proto</a>',
    '<a href="/proxy/https://othersite.com/">other site, dif proto</a>',
    '<a href="javascript:void(0)" onclick="window.open(\'/proxy/http://sub.example.com/\')">new subdomain using inline JS</a>',
    '<img src="/proxy/http://example.com/img.jpg" alt="no change" />',
    '<img src="/proxy/https://example.com/img.jpg" alt="new proto">',
  ].join("\n");

  const expected = [
    '<a href="/proxy/http://example.com/">no change</a>',
    '<a href="/proxy/http://example.com/?__proxy_cookies_to=https%3A%2F%2Fexample.com%2F">new proto</a>',
    '<a href="/proxy/http://example.com/?__proxy_cookies_to=http%3A%2F%2Fsub.example.com%2F">new subdomain</a>',
    '<a href="/proxy/http://othersite.com/">other site, same proto</a>',
    '<a href="/proxy/https://othersite.com/">other site, dif proto</a>',
    '<a href="javascript:void(0)" onclick="window.open(\'/proxy/http://example.com/?__proxy_cookies_to=http%3A%2F%2Fsub.example.com%2F\')">new subdomain using inline JS</a>',
    '<img src="/proxy/http://example.com/img.jpg" alt="no change" />',
    '<img src="/proxy/http://example.com/img.jpg?__proxy_cookies_to=https%3A%2F%2Fexample.com%2Fimg.jpg" alt="new proto">',
  ].join("\n");

  sourceStream.end(source);
  const actual = await pipeToString(data.stream);
  assert.strictEqual(actual, expected);
});

test("should work with SameSite attributes", () => {
  const instance = cookies({
    prefix: "/proxy/",
    processContentTypes: [],
  });
  const data = getData();
  data.headers["set-cookie"] = [
    "1P_JAR=2019-12-19-00; expires=Sat, 18-Jan-2020 00:42:02 GMT; path=/; domain=.google.com; SameSite=none",
  ];
  instance.handleResponse(data);
  const actual = data.headers["set-cookie"][0];
  assert.ok(actual.toLowerCase().includes("samesite=none"));
});
