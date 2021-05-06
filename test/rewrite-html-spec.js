"use strict";

const { test } = require("tap");
const _ = require("lodash");
const concat = require("concat-stream");
const { getContext } = require("./test_utils");
const htmlParser = require("../lib/html-parser.js");
const htmlRewriter = require("../lib/rewrite-html.js");

const testUri = new URL("http://localhost:8081/");

const htmlTestLines = {
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

  '<video poster="/poster.jpg">':
    '<video poster="/proxy/http://localhost:8081/poster.jpg">',

  '<img src="/files/16797/clock-demo-200px.png" alt="Clock" srcset="/files/16864/clock-demo-200px.png 1x, /clock-demo-400px.png 2x, big.jpg 2400w">':
    '<img src="/proxy/http://localhost:8081/files/16797/clock-demo-200px.png" alt="Clock" srcset="/proxy/http://localhost:8081/files/16864/clock-demo-200px.png 1x, /proxy/http://localhost:8081/clock-demo-400px.png 2x, big.jpg 2400w">',

  '<img src="banner.jpg" srcset="non sense">':
    '<img src="banner.jpg" srcset="non sense">',
};

//const testPrefix = "/proxy/";

_.each(htmlTestLines, function (expected, source) {
  test(`should rewrite ${source} to ${expected}`, function (t) {
    t.plan(1);
    const context = getContext({
      url: testUri,
      contentType: "text/html",
    });
    const sourceStream = context.stream;
    sourceStream.setEncoding("utf8");
    htmlParser(context);
    htmlRewriter(context);
    context.stream.setEncoding("utf8");
    context.stream.pipe(
      concat((actual) => {
        t.equal(actual, expected);
        t.end();
      })
    );
    sourceStream.end(source);
  });
});
