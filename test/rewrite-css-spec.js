"use strict";

//const { PassThrough } = require("stream");
const { test } = require("tap");
const _ = require("lodash");
const concat = require("concat-stream");
const UrlWrapper = require("../lib/prefix-url-wrapper.js");
const RewriteCss = require("../lib/rewrite-css.js");
const prefix = "/proxy/";
const config = {
  prefix,
};
const { fixCSS } = RewriteCss(config);

const testUri = new URL("http://localhost:8081/");

const context = {
  urlWrapper: new UrlWrapper(
    new URL("http://proxy-host.invalid" + prefix),
    testUri
  ),
};

const cssTestLines = {
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
    const actual = fixCSS(source, context);
    t.equal(
      actual,
      expected,
      "Should rewrite '" + source + "' to '" + expected + '"'
    );
  });
  t.end();
  concat;
});

// todo: test a stream, test in a style tag, test in an attribute
