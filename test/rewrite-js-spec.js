"use strict";
const { test } = require("tap");
const concat = require("concat-stream");
const { rewriteJsSync, RewriteJsStream } = require("../lib/rewrite-js.js");

const cs = { proxyScriptSync: rewriteJsSync };

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

test("it rewrites ES6", function (t) {
  const source =
    "var loc = window.location, func = (a, b, ...rest) => ({a, b, ...rest});";
  const expected =
    "var loc = unblocker.maybeGetProxy(window).location, func = (a, b, ...rest) => ({a, b, ...rest});";
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
  const expected = "var path = unblocker.maybeGetProxy(location).pathname;";
  const actual = cs.proxyScriptSync(source);
  t.equal(actual, expected);
  t.end();
});

test("it rewrites location property writes", function (t) {
  const source = "location.pathname = '/newpath';";
  const expected = "unblocker.maybeGetProxy(location).pathname = '/newpath';";
  const actual = cs.proxyScriptSync(source);
  t.equal(actual, expected);
  t.end();
});

test("it rewrites location writes", function (t) {
  const source = "location = 'http://example.com/';";
  //   const expected = `if (location === window.location) {
  //   unblocker.window.location = 'http://example.com/';
  // } else {
  //   location = 'http://example.com/';
  // }`;
  const expected = "unblocker.window.location = 'http://example.com/';";
  const actual = cs.proxyScriptSync(source);
  t.equal(actual.replace(/\r/g, ""), expected);
  t.end();
});

test("it rewrites after a block", function (t) {
  const source = "if(a){a()}window.location.href=b;";
  const expected = "if(a){a()}unblocker.maybeGetProxy(window).location.href=b;";
  const actual = cs.proxyScriptSync(source);
  t.equal(actual.replace(/\r/g, ""), expected);
  t.end();
});

test("it doesn't mess with properties named location", function (t) {
  const source =
    "var foo = {location: 1, location: 2,location:3, location : 4};";
  const expected = source;
  const actual = cs.proxyScriptSync(source);
  t.equal(actual.replace(/\r/g, ""), expected);
  t.end();
});

test("it rewrites a single-expression if body", function (t) {
  const source = 'if (oj("DISABLE_WARM_LOADS")) window.location.reload();';
  const expected =
    'if (oj("DISABLE_WARM_LOADS")) unblocker.maybeGetProxy(window).location.reload();';
  const actual = cs.proxyScriptSync(source);
  t.equal(actual.replace(/\r/g, ""), expected);
  t.end();
});

test("it rewrites a single-expression if body (minified)", function (t) {
  const source = 'if(oj("DISABLE_WARM_LOADS"))window.location.reload();';
  const expected =
    'if(oj("DISABLE_WARM_LOADS"))unblocker.maybeGetProxy(window).location.reload();';
  const actual = cs.proxyScriptSync(source);
  t.equal(actual.replace(/\r/g, ""), expected);
  t.end();
});

test("it includes parens when they are part of an object", function (t) {
  const source = "Sc(this.domHelper_.getWindow().location.href)";
  const expected =
    "Sc(unblocker.maybeGetProxy(this.domHelper_.getWindow()).location.href)";
  const actual = cs.proxyScriptSync(source);
  t.equal(actual.replace(/\r/g, ""), expected);
  t.end();
});

test("it works on streams when there is a split in the object", function (t) {
  const source = ["new Sg(g", ".A.location.href,g.A,!1)"];
  const expected = "new Sg(unblocker.maybeGetProxy(g.A).location.href,g.A,!1)";

  const stream = new RewriteJsStream();
  stream.setEncoding("utf8");
  stream.pipe(
    concat((actual) => {
      t.equal(actual, expected);
      t.end();
    })
  );

  source.forEach((c) => stream.write(c));
  stream.end();
});
