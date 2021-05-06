"use strict";

//const { PassThrough } = require("stream");
const { test } = require("tap");
const _ = require("lodash");
const concat = require("concat-stream");
const {
  rewriteCssSync,
  RewriteCssStream,
  handleResponse,
} = require("../lib/rewrite-css.js");
const htmlParser = require("../lib/html-parser");
const { getContext } = require("./test_utils");

const testUri = new URL("http://localhost:8081/");
const context = getContext({ url: testUri });

const cssTestLines = {
  "@import 'custom.css';": "@import 'custom.css';",
  "@import '/custom.css';":
    "@import '/proxy/http://localhost:8081/custom.css';",
  '@import url("/custom.css");':
    '@import url("/proxy/http://localhost:8081/custom.css");',
  '@import url("chrome://communicator/skin/");':
    '@import url("chrome://communicator/skin/");',
  '@import url("dir/fineprint.css") print;':
    '@import url("dir/fineprint.css") print;',
  '@import url("http://example.com/bluish.css") speech;':
    '@import url("/proxy/http://example.com/bluish.css") speech;',
  '@import "../common.css" screen;':
    '@import "/proxy/http://localhost:8081/common.css" screen;',
  "@import url('/landscape.css') screen and (orientation:landscape);":
    "@import url('/proxy/http://localhost:8081/landscape.css') screen and (orientation:landscape);",
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
  // This isn't perfect, it'd be preferable to keep the original format.
  // But new URL() converts \ to / which breaks everything, and this gets around that.
  ".escaped-whitespace { background-url: url( /img\\ 1.jpg )":
    ".escaped-whitespace { background-url: url( /proxy/http://localhost:8081/img%201.jpg )",
  ".escaped-paren { background-url: url( /img\\)1.jpg )":
    ".escaped-paren { background-url: url( /proxy/http://localhost:8081/img%291.jpg )",
};
const allSource = Object.keys(cssTestLines).join("\n");
const allExpected = Object.values(cssTestLines).join("\n");

test("should rewrite (or not rewrite) various CSS strings correctly", function (t) {
  _.each(cssTestLines, function (expected, source) {
    const actual = rewriteCssSync(source, context);
    t.equal(
      actual,
      expected,
      "Should rewrite '" + source + "' to '" + expected + '"'
    );
  });
  t.end();
});

test("should rewrite a big chunk of CSS correctly", function (t) {
  const actual = rewriteCssSync(allSource, context);
  t.equal(actual, allExpected);
  t.end();
});

test("should rewrite css in a stream", function (t) {
  t.plan(1);
  const context = getContext({ url: testUri });
  const stream = new RewriteCssStream(context);
  stream.pipe(
    concat((actual) => {
      t.equal(actual, allExpected);
      t.end();
    })
  );
  stream.end(allSource);
});

test("should rewrite css in a stream chunked at any location", function (t) {
  t.plan(1);
  const context = getContext({ url: testUri });
  const stream = new RewriteCssStream(context);
  stream.pipe(
    concat((actual) => {
      t.equal(actual, allExpected);
      t.end();
    })
  );
  for (let i = 0; i < allSource.length; i++) {
    stream.write(allSource[i]);
  }
  stream.end();
});

test("should handle inline style tags and attributes in html", function (t) {
  const source = `<html>
<head>
<style>
.foo {background-image: url('/bar.jpg')}
</style>
</head>
<body style="background: url('/bg.png') repeat-x blue">
</body>
</html>`;
  const expected = `<html>
<head>
<style>
.foo {background-image: url('/proxy/http://localhost:8081/bar.jpg')}
</style>
</head>
<body style="background: url('/proxy/http://localhost:8081/bg.png') repeat-x blue">
</body>
</html>`;
  const context = getContext({ url: testUri });
  const inStream = context.stream;
  inStream.setEncoding("utf8");
  htmlParser(context);
  handleResponse(context);
  const outStream = context.stream;
  outStream.setEncoding("utf8");
  outStream.pipe(
    concat(function (actual) {
      t.equal(actual, expected);
      t.end();
    })
  );
  inStream.end(source);
});
