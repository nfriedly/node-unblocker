"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const URL = require("url");
const _ = require("lodash");
const concat = require("concat-stream");

const urlPrefix = require("../lib/url-prefixer.js")({
  prefix: "/proxy/",
});

const testLines = {
  // source => expected result

  // xmlns items first two should NOT get rewritten
  '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en-us">':
    '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en-us">',
  '<head xmlns:og="http://ogp.me/ns#" xmlns:fb="http://ogp.me/ns/fb#">':
    '<head xmlns:og="http://ogp.me/ns#" xmlns:fb="http://ogp.me/ns/fb#">',

  '<link rel="stylesheet" href="http://example.com/styles.css"/>':
    '<link rel="stylesheet" href="/proxy/http://example.com/styles.css"/>',
  '<link rel="stylesheet" href="https://example.com/styles.css"/>':
    '<link rel="stylesheet" href="/proxy/https://example.com/styles.css"/>',
  '<link rel="stylesheet" href="//example.com/styles.css"/>':
    '<link rel="stylesheet" href="/proxy/http://example.com/styles.css"/>',
  '<link rel="stylesheet" href="/styles.css"/>':
    '<link rel="stylesheet" href="/proxy/http://localhost:8081/styles.css"/>',
  '<link rel="stylesheet" href="styles.css"/>':
    '<link rel="stylesheet" href="styles.css"/>',

  "<link rel=\"stylesheet\" href='http://example.com/styles.css'/>":
    "<link rel=\"stylesheet\" href='/proxy/http://example.com/styles.css'/>",
  "<link rel=\"stylesheet\" href='https://example.com/styles.css'/>":
    "<link rel=\"stylesheet\" href='/proxy/https://example.com/styles.css'/>",
  "<link rel=\"stylesheet\" href='//example.com/styles.css'/>":
    "<link rel=\"stylesheet\" href='/proxy/http://example.com/styles.css'/>",
  "<link rel=\"stylesheet\" href='/styles.css'/>":
    "<link rel=\"stylesheet\" href='/proxy/http://localhost:8081/styles.css'/>",
  "<link rel=\"stylesheet\" href='styles.css'/>":
    "<link rel=\"stylesheet\" href='styles.css'/>",

  '<link rel="stylesheet" href=http://example.com/styles.css />':
    '<link rel="stylesheet" href=/proxy/http://example.com/styles.css />',
  '<link rel="stylesheet" href=https://example.com/styles.css />':
    '<link rel="stylesheet" href=/proxy/https://example.com/styles.css />',
  '<link rel="stylesheet" href=//example.com/styles.css />':
    '<link rel="stylesheet" href=/proxy/http://example.com/styles.css />',
  '<link rel="stylesheet" href=/styles.css />':
    '<link rel="stylesheet" href=/proxy/http://localhost:8081/styles.css />',
  '<link rel="stylesheet" href=styles.css />':
    '<link rel="stylesheet" href=styles.css />',

  ".bg1 { background: url(http://example.com/img.jpg); }":
    ".bg1 { background: url(/proxy/http://example.com/img.jpg); }",
  ".bg2 { background: url(https://example.com/img.jpg); }":
    ".bg2 { background: url(/proxy/https://example.com/img.jpg); }",
  ".bg3 { background: url(//example.com/img.jpg); }":
    ".bg3 { background: url(/proxy/http://example.com/img.jpg); }",
  ".bg4 { background: url(/img.jpg); }":
    ".bg4 { background: url(/proxy/http://localhost:8081/img.jpg); }",
  ".bg5 { background: url(img.jpg); }": ".bg5 { background: url(img.jpg); }",
  ".bg1 { background: url('http://example.com/img.jpg'); }":
    ".bg1 { background: url('/proxy/http://example.com/img.jpg'); }",
  ".bg2 { background: url('https://example.com/img.jpg'); }":
    ".bg2 { background: url('/proxy/https://example.com/img.jpg'); }",
  ".bg3 { background: url('//example.com/img.jpg'); }":
    ".bg3 { background: url('/proxy/http://example.com/img.jpg'); }",
  ".bg4 { background: url('/img.jpg'); }":
    ".bg4 { background: url('/proxy/http://localhost:8081/img.jpg'); }",
  ".bg5 { background: url('img.jpg'); }":
    ".bg5 { background: url('img.jpg'); }",
  '.bg1 { background: url("http://example.com/img.jpg"); }':
    '.bg1 { background: url("/proxy/http://example.com/img.jpg"); }',
  '.bg2 { background: url("https://example.com/img.jpg"); }':
    '.bg2 { background: url("/proxy/https://example.com/img.jpg"); }',
  '.bg3 { background: url("//example.com/img.jpg"); }':
    '.bg3 { background: url("/proxy/http://example.com/img.jpg"); }',
  '.bg4 { background: url("/img.jpg"); }':
    '.bg4 { background: url("/proxy/http://localhost:8081/img.jpg"); }',
  '.bg5 { background: url("img.jpg"); }':
    '.bg5 { background: url("img.jpg"); }',
  ".bg1 { background: url( http://example.com/img.jpg ); }":
    ".bg1 { background: url( /proxy/http://example.com/img.jpg ); }",
  ".bg2 { background: url( https://example.com/img.jpg ); }":
    ".bg2 { background: url( /proxy/https://example.com/img.jpg ); }",
  ".bg3 { background: url( //example.com/img.jpg ); }":
    ".bg3 { background: url( /proxy/http://example.com/img.jpg ); }",
  ".bg4 { background: url( /img.jpg ); }":
    ".bg4 { background: url( /proxy/http://localhost:8081/img.jpg ); }",
  ".bg5 { background: url( img.jpg ); }":
    ".bg5 { background: url( img.jpg ); }",
  ".bg1 { background: url( 'http://example.com/img.jpg' ); }":
    ".bg1 { background: url( '/proxy/http://example.com/img.jpg' ); }",
  ".bg2 { background: url( 'https://example.com/img.jpg' ); }":
    ".bg2 { background: url( '/proxy/https://example.com/img.jpg' ); }",
  ".bg3 { background: url( '//example.com/img.jpg' ); }":
    ".bg3 { background: url( '/proxy/http://example.com/img.jpg' ); }",
  ".bg4 { background: url( '/img.jpg' ); }":
    ".bg4 { background: url( '/proxy/http://localhost:8081/img.jpg' ); }",
  ".bg5 { background: url( 'img.jpg' ); }":
    ".bg5 { background: url( 'img.jpg' ); }",
  '.bg1 { background: url( "http://example.com/img.jpg" ); }':
    '.bg1 { background: url( "/proxy/http://example.com/img.jpg" ); }',
  '.bg2 { background: url( "https://example.com/img.jpg" ); }':
    '.bg2 { background: url( "/proxy/https://example.com/img.jpg" ); }',
  '.bg3 { background: url( "//example.com/img.jpg" ); }':
    '.bg3 { background: url( "/proxy/http://example.com/img.jpg" ); }',
  '.bg4 { background: url( "/img.jpg" ); }':
    '.bg4 { background: url( "/proxy/http://localhost:8081/img.jpg" ); }',
  '.bg5 { background: url( "img.jpg" ); }':
    '.bg5 { background: url( "img.jpg" ); }',
  '.bg4 { background: url(   "/img.jpg"   ); }':
    '.bg4 { background: url(   "/proxy/http://localhost:8081/img.jpg"   ); }',
  '.bg4 { background: url( "/img.jpg"  ); }':
    '.bg4 { background: url( "/proxy/http://localhost:8081/img.jpg"  ); }',

  '<script src="http://example.com/scripts.js"></script>':
    '<script src="/proxy/http://example.com/scripts.js"></script>',
  '<script src="https://example.com/scripts.js"></script>':
    '<script src="/proxy/https://example.com/scripts.js"></script>',
  '<script src="//example.com/scripts.js"></script>':
    '<script src="/proxy/http://example.com/scripts.js"></script>',
  '<script src="/scripts.js"></script>':
    '<script src="/proxy/http://localhost:8081/scripts.js"></script>',
  '<script src="scripts.js"></script>': '<script src="scripts.js"></script>',

  "<script src='http://example.com/scripts.js'></script>":
    "<script src='/proxy/http://example.com/scripts.js'></script>",
  "<script src='https://example.com/scripts.js'></script>":
    "<script src='/proxy/https://example.com/scripts.js'></script>",
  "<script src='//example.com/scripts.js'></script>":
    "<script src='/proxy/http://example.com/scripts.js'></script>",
  "<script src='/scripts.js'></script>":
    "<script src='/proxy/http://localhost:8081/scripts.js'></script>",
  "<script src='scripts.js'></script>": "<script src='scripts.js'></script>",

  "<script src=http://example.com/scripts.js></script>":
    "<script src=/proxy/http://example.com/scripts.js></script>",
  "<script src=https://example.com/scripts.js></script>":
    "<script src=/proxy/https://example.com/scripts.js></script>",
  "<script src=//example.com/scripts.js></script>":
    "<script src=/proxy/http://example.com/scripts.js></script>",
  "<script src=/scripts.js></script>":
    "<script src=/proxy/http://localhost:8081/scripts.js></script>",
  "<script src=scripts.js></script>": "<script src=scripts.js></script>",

  '<a href="/site/http/page.html">link with "http" in the url</a>':
    '<a href="/proxy/http://localhost:8081/site/http/page.html">link with "http" in the url</a>',
  '<a href="/site/https/page.html">link with "https" in the url</a>':
    '<a href="/proxy/http://localhost:8081/site/https/page.html">link with "https" in the url</a>',
  '<a href="http://localhost:8080">link with port number</a>':
    '<a href="/proxy/http://localhost:8080">link with port number</a>',

  '<a href="/">link to site root</a>':
    '<a href="/proxy/http://localhost:8081/">link to site root</a>',

  '<a href="#anchor">link to anchor</a>':
    '<a href="#anchor">link to anchor</a>',
  '<a href="http://example.com/#anchor">offsite link with anchor</a>':
    '<a href="/proxy/http://example.com/#anchor">offsite link with anchor</a>',
  '<a href="/#anchor">link to site root with anchor</a>':
    '<a href="/proxy/http://localhost:8081/#anchor">link to site root with anchor</a>',

  '<form action="">': '<form action="">',
  '<form action="/mytarget">':
    '<form action="/proxy/http://localhost:8081/mytarget">',
  '<form action="mytarget.php">': '<form action="mytarget.php">',

  // yes, this is a real thing. https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button#attr-formaction
  '<button formaction="">': '<button formaction="">',
  '<button formaction="/mytarget">':
    '<button formaction="/proxy/http://localhost:8081/mytarget">',
  '<button formaction="mytarget.php">': '<button formaction="mytarget.php">',
};

const testUri = URL.parse("http://localhost:8081/");
const testPrefix = "/proxy/";

function createStreamPromise(start, end) {
  return new Promise((resolve, reject) => {
    const stream = urlPrefix.createStream(testUri);
    stream.setEncoding("utf8");
    stream.pipe(
      concat(function (actual) {
        resolve(actual);
      })
    );
    stream.on("error", reject);
    stream.write(start);
    stream.end(end);
  });
}

test("should rewrite (or not rewrite) various strings correctly", () => {
  _.each(testLines, function (expected, source) {
    const actual = urlPrefix.rewriteUrls(source, testUri, testPrefix);
    assert.strictEqual(
      actual,
      expected,
      "Should rewrite '" + source + "' to '" + expected + '"'
    );
  });
});

test("should correctly handle packets split at different locations", async () => {
  const fullSource = _.keys(testLines).join("\n");
  const expected = _.values(testLines).join("\n");

  for (
    let splitLocation = 0;
    splitLocation < fullSource.length;
    splitLocation++
  ) {
    const start = fullSource.substr(0, splitLocation);
    const end = fullSource.substr(splitLocation);
    const actual = await createStreamPromise(start, end);
    assert.strictEqual(
      actual,
      expected,
      "Should handle chunk breaks between '" +
        start.substr(-20) +
        "' and '" +
        end.substr(0, 20) +
        "' correctly"
    );
  }
});

// todo: add tests for javascript (?)
