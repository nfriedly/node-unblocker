"use strict";
const { test } = require("tap");
const clientScripts = require("../lib/client-scripts");

const cs = clientScripts({ prefix: "/proxy/" });

test("it passes basic js through untouched", function (t) {
  const source = `
function add(a, b) {
  return a +
    // Weird formatting, huh?
    b;
}
`;
  const actual = cs.proxyScriptSync(source);
  t.equal(actual, source);
  t.end();
});

test("it rewrites window.location reads", function (t) {
  const source = "var loc = window.location;";
  const expected = "var loc = unblocker.maybeGetProxy(window).location;";
  const actual = cs.proxyScriptSync(source);
  t.equal(actual, expected);
  t.end();
});

test("it rewrites window.location reads in an object", function (t) {
  const source = "var obj = { loc: window.location };";
  const expected =
    "var obj = { loc: unblocker.maybeGetProxy(window).location };";
  const actual = cs.proxyScriptSync(source);
  t.equal(actual, expected);
  t.end();
});

test("it rewrites window.location writes", function (t) {
  const source = "window.location = 'http://example.com/';";
  const expected =
    "unblocker.maybeGetProxy(window).location = 'http://example.com/';";
  const actual = cs.proxyScriptSync(source);
  t.equal(actual, expected);
  t.end();
});

test("it rewrites location property reads", function (t) {
  const source = "var path = location.pathname;";
  const expected = "var path = unblocker.location.pathname;";
  const actual = cs.proxyScriptSync(source);
  t.equal(actual, expected);
  t.end();
});

test("it rewrites location property writes", function (t) {
  const source = "location.pathname = '/newpath';";
  const expected = "unblocker.location.pathname = '/newpath';";
  const actual = cs.proxyScriptSync(source);
  t.equal(actual, expected);
  t.end();
});

test("it rewrites location writes", function (t) {
  const source = "location = 'http://example.com/';";
  const expected = `if (location === window.location) {
  unblocker.window.location = 'http://example.com/';
} else {
  location = 'http://example.com/';
}`;
  const actual = cs.proxyScriptSync(source);
  t.equal(actual.replace(/\r/g, ""), expected);
  t.end();
});
