"use strict";

const { PassThrough } = require("stream");
var URL = require("url"),
  test = require("tap").test,
  _ = require("lodash"),
  concat = require("concat-stream");

var urlPrefix = require("../lib/url-prefixer.js")({
  prefix: "/proxy/",
});

var htmlTestLines = {
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
    '<link rel="stylesheet" href="/proxy/http://example.com/styles.css"/>',
  "<link rel=\"stylesheet\" href='https://example.com/styles.css'/>":
    '<link rel="stylesheet" href="/proxy/https://example.com/styles.css"/>',
  "<link rel=\"stylesheet\" href='//example.com/styles.css'/>":
    '<link rel="stylesheet" href="/proxy/http://example.com/styles.css"/>',
  "<link rel=\"stylesheet\" href='/styles.css'/>":
    '<link rel="stylesheet" href="/proxy/http://localhost:8081/styles.css"/>',
  "<link rel=\"stylesheet\" href='styles.css'/>":
    '<link rel="stylesheet" href="styles.css"/>',

  '<link rel="stylesheet" href=http://example.com/styles.css />':
    '<link rel="stylesheet" href="/proxy/http://example.com/styles.css"/>',
  '<link rel="stylesheet" href=https://example.com/styles.css />':
    '<link rel="stylesheet" href="/proxy/https://example.com/styles.css"/>',
  '<link rel="stylesheet" href=//example.com/styles.css />':
    '<link rel="stylesheet" href="/proxy/http://example.com/styles.css"/>',
  '<link rel="stylesheet" href=/styles.css />':
    '<link rel="stylesheet" href="/proxy/http://localhost:8081/styles.css"/>',
  '<link rel="stylesheet" href=styles.css />':
    '<link rel="stylesheet" href="styles.css"/>',

  // script tags with double quotes
  '<script src="http://example.com/scripts.js"></script>':
    '<script src="/proxy/http://example.com/scripts.js"></script>',
  '<script src="https://example.com/scripts.js"></script>':
    '<script src="/proxy/https://example.com/scripts.js"></script>',
  '<script src="//example.com/scripts.js"></script>':
    '<script src="/proxy/http://example.com/scripts.js"></script>',
  '<script src="/scripts.js"></script>':
    '<script src="/proxy/http://localhost:8081/scripts.js"></script>',
  '<script src="scripts.js"></script>': '<script src="scripts.js"></script>',

  // script tags with single quotes
  "<script src='http://example.com/scripts.js'></script>":
    '<script src="/proxy/http://example.com/scripts.js"></script>',
  "<script src='https://example.com/scripts.js'></script>":
    '<script src="/proxy/https://example.com/scripts.js"></script>',
  "<script src='//example.com/scripts.js'></script>":
    '<script src="/proxy/http://example.com/scripts.js"></script>',
  "<script src='/scripts.js'></script>":
    '<script src="/proxy/http://localhost:8081/scripts.js"></script>',
  "<script src='scripts.js'></script>": '<script src="scripts.js"></script>',

  // script tags with no quotes
  "<script src=http://example.com/scripts.js></script>":
    '<script src="/proxy/http://example.com/scripts.js"></script>',
  "<script src=https://example.com/scripts.js></script>":
    '<script src="/proxy/https://example.com/scripts.js"></script>',
  "<script src=//example.com/scripts.js></script>":
    '<script src="/proxy/http://example.com/scripts.js"></script>',
  "<script src=/scripts.js></script>":
    '<script src="/proxy/http://localhost:8081/scripts.js"></script>',
  "<script src=scripts.js></script>": '<script src="scripts.js"></script>',

  // for the later test where everything is jumbled together
  "</head><body>": "</head><body>",

  '<a href="/site/http/page.html">link with "http" in the url</a>':
    '<a href="/proxy/http://localhost:8081/site/http/page.html">link with "http" in the url</a>',
  '<a href="/site/https/page.html">link with "https" in the url</a>':
    '<a href="/proxy/http://localhost:8081/site/https/page.html">link with "https" in the url</a>',
  '<a href="http://localhost:8080">link with port number</a>':
    '<a href="/proxy/http://localhost:8080/">link with port number</a>',

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

  // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button#attr-formaction
  '<button formaction="">': '<button formaction="">',
  '<button formaction="/mytarget">':
    '<button formaction="/proxy/http://localhost:8081/mytarget">',
  '<button formaction="mytarget.php">': '<button formaction="mytarget.php">',
};

var testUri = URL.parse("http://localhost:8081/");
var testPrefix = "/proxy/";

_.each(htmlTestLines, function (expected, source) {
  test(`should rewrite ${source} to ${expected}`, function (t) {
    t.plan(1);
    const sourceStream = new PassThrough();
    sourceStream.setEncoding("utf8");
    const data = {
      url: testUri.href,
      stream: sourceStream,
      contentType: "text/html",
    };
    urlPrefix(data);
    data.stream.setEncoding("utf8");
    data.stream.pipe(
      concat((actual) => {
        t.equal(actual, expected);
        t.end();
      })
    );
    sourceStream.end(source);
  });
});

var cssTestLines = {
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
};

test("should rewrite (or not rewrite) various CSS strings correctly", function (t) {
  _.each(cssTestLines, function (expected, source) {
    var actual = urlPrefix.rewriteUrls(source, testUri, testPrefix);
    t.equal(
      actual,
      expected,
      "Should rewrite '" + source + "' to '" + expected + '"'
    );
  });
  t.end();
  concat;
});

const fullSource = Object.keys(htmlTestLines)
  .concat("<style>", Object.keys(cssTestLines), "</style>")
  .join("\n");
const fullExpected = Object.values(htmlTestLines)
  .concat("<style>", Object.values(cssTestLines), "</style>")
  .join("\n");

test(`should rewrite the whole thing`, function (t) {
  t.plan(1);
  const sourceStream = new PassThrough();
  sourceStream.setEncoding("utf8");
  const data = {
    url: testUri.href,
    stream: sourceStream,
    contentType: "text/html",
  };
  urlPrefix(data);
  data.stream.setEncoding("utf8");
  data.stream.pipe(
    concat((actual) => {
      t.equal(actual, fullExpected);
      t.end();
    })
  );
  sourceStream.end(fullSource);
});

test("should correctly handle packets split at different locations", function (t) {
  function createSubTest(start, end) {
    // this causes the following warning:
    // (node) warning: Recursive process.nextTick detected. This will break in the next version of node. Please use setImmediate for recursive deferral.
    //t.test("Should handle breaks between '" + start.substr(-20) + "' and '" + end.substr(0,20) + "' correctly", function(t) {
    const sourceStream = new PassThrough();
    sourceStream.setEncoding("utf8");
    const data = {
      url: testUri.href,
      stream: sourceStream,
      contentType: "text/html",
    };
    urlPrefix(data);
    data.stream.setEncoding("utf8");
    data.stream.pipe(
      concat((actual) => {
        t.equal(
          actual,
          fullExpected,
          "Should handle chunk breaks between '" +
            start.substr(-20) +
            "' and '" +
            end.substr(0, 20) +
            "' correctly"
        );
        if (actual != fullExpected) throw "stopping early";
      })
    );
    sourceStream.write(start);
    sourceStream.end(end);
    //});
  }

  t.plan(fullSource.length);
  for (
    var splitLocation = 0, l = fullSource.length;
    splitLocation < l;
    splitLocation++
  ) {
    var start = fullSource.substr(0, splitLocation);
    var end = fullSource.substr(splitLocation);
    createSubTest(start, end);
  }
});
// todo: add tests for javascript (?)
