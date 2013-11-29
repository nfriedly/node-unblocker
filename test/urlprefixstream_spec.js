var fs = require('fs'),
    URL = require('url'),
    test = require('tap').test,
    _ = require('underscore');
    
var urlPrefix = require('../lib/urlprefixstream');
    
var testLines =  { 
    // source => expected result
  '<link rel="stylesheet" href="http://example.com/styles.css"/>': '<link rel="stylesheet" href="/proxy/http://example.com/styles.css"/>',
  '<link rel="stylesheet" href="https://example.com/styles.css"/>': '<link rel="stylesheet" href="/proxy/https://example.com/styles.css"/>',
  '<link rel="stylesheet" href="//example.com/styles.css"/>': '<link rel="stylesheet" href="/proxy/http://example.com/styles.css"/>',
  '<link rel="stylesheet" href="/styles.css"/>': '<link rel="stylesheet" href="/proxy/http://localhost:8081/styles.css"/>',
  '<link rel="stylesheet" href="styles.css"/>': '<link rel="stylesheet" href="styles.css"/>',

  '<link rel="stylesheet" href=\'http://example.com/styles.css\'/>': '<link rel="stylesheet" href=\'/proxy/http://example.com/styles.css\'/>',
  '<link rel="stylesheet" href=\'https://example.com/styles.css\'/>': '<link rel="stylesheet" href=\'/proxy/https://example.com/styles.css\'/>',
  '<link rel="stylesheet" href=\'//example.com/styles.css\'/>': '<link rel="stylesheet" href=\'/proxy/http://example.com/styles.css\'/>',
  '<link rel="stylesheet" href=\'/styles.css\'/>': '<link rel="stylesheet" href=\'/proxy/http://localhost:8081/styles.css\'/>',
  '<link rel="stylesheet" href=\'styles.css\'/>': '<link rel="stylesheet" href=\'styles.css\'/>',

  '<link rel="stylesheet" href=http://example.com/styles.css />': '<link rel="stylesheet" href=/proxy/http://example.com/styles.css />',
  '<link rel="stylesheet" href=https://example.com/styles.css />': '<link rel="stylesheet" href=/proxy/https://example.com/styles.css />',
  '<link rel="stylesheet" href=//example.com/styles.css />': '<link rel="stylesheet" href=/proxy/http://example.com/styles.css />',
  '<link rel="stylesheet" href=/styles.css />': '<link rel="stylesheet" href=/proxy/http://localhost:8081/styles.css />',
  '<link rel="stylesheet" href=styles.css />': '<link rel="stylesheet" href=styles.css />',

  '.bg1 { background: url(http://example.com/img.jpg); }': '.bg1 { background: url(/proxy/http://example.com/img.jpg); }',
  '.bg2 { background: url(https://example.com/img.jpg); }': '.bg2 { background: url(/proxy/https://example.com/img.jpg); }',
  '.bg3 { background: url(//example.com/img.jpg); }': '.bg3 { background: url(/proxy/http://example.com/img.jpg); }',
  '.bg4 { background: url(/img.jpg); }': '.bg4 { background: url(/proxy/http://localhost:8081/img.jpg); }',
  '.bg5 { background: url(img.jpg); }': '.bg5 { background: url(img.jpg); }',
  '.bg1 { background: url(\'http://example.com/img.jpg\'); }': '.bg1 { background: url(\'/proxy/http://example.com/img.jpg\'); }',
  '.bg2 { background: url(\'https://example.com/img.jpg\'); }': '.bg2 { background: url(\'/proxy/https://example.com/img.jpg\'); }',
  '.bg3 { background: url(\'//example.com/img.jpg\'); }': '.bg3 { background: url(\'/proxy/http://example.com/img.jpg\'); }',
  '.bg4 { background: url(\'/img.jpg\'); }': '.bg4 { background: url(\'/proxy/http://localhost:8081/img.jpg\'); }',
  '.bg5 { background: url(\'img.jpg\'); }': '.bg5 { background: url(\'img.jpg\'); }',
  '.bg1 { background: url("http://example.com/img.jpg"); }': '.bg1 { background: url("/proxy/http://example.com/img.jpg"); }',
  '.bg2 { background: url("https://example.com/img.jpg"); }': '.bg2 { background: url("/proxy/https://example.com/img.jpg"); }',
  '.bg3 { background: url("//example.com/img.jpg"); }': '.bg3 { background: url("/proxy/http://example.com/img.jpg"); }',
  '.bg4 { background: url("/img.jpg"); }': '.bg4 { background: url("/proxy/http://localhost:8081/img.jpg"); }',
  '.bg5 { background: url("img.jpg"); }': '.bg5 { background: url("img.jpg"); }',
  '.bg1 { background: url( http://example.com/img.jpg ); }': '.bg1 { background: url( /proxy/http://example.com/img.jpg ); }',
  '.bg2 { background: url( https://example.com/img.jpg ); }': '.bg2 { background: url( /proxy/https://example.com/img.jpg ); }',
  '.bg3 { background: url( //example.com/img.jpg ); }': '.bg3 { background: url( /proxy/http://example.com/img.jpg ); }',
  '.bg4 { background: url( /img.jpg ); }': '.bg4 { background: url( /proxy/http://localhost:8081/img.jpg ); }',
  '.bg5 { background: url( img.jpg ); }': '.bg5 { background: url( img.jpg ); }',
  '.bg1 { background: url( \'http://example.com/img.jpg\' ); }': '.bg1 { background: url( \'/proxy/http://example.com/img.jpg\' ); }',
  '.bg2 { background: url( \'https://example.com/img.jpg\' ); }': '.bg2 { background: url( \'/proxy/https://example.com/img.jpg\' ); }',
  '.bg3 { background: url( \'//example.com/img.jpg\' ); }': '.bg3 { background: url( \'/proxy/http://example.com/img.jpg\' ); }',
  '.bg4 { background: url( \'/img.jpg\' ); }': '.bg4 { background: url( \'/proxy/http://localhost:8081/img.jpg\' ); }',
  '.bg5 { background: url( \'img.jpg\' ); }': '.bg5 { background: url( \'img.jpg\' ); }',
  '.bg1 { background: url( "http://example.com/img.jpg" ); }': '.bg1 { background: url( "/proxy/http://example.com/img.jpg" ); }',
  '.bg2 { background: url( "https://example.com/img.jpg" ); }': '.bg2 { background: url( "/proxy/https://example.com/img.jpg" ); }',
  '.bg3 { background: url( "//example.com/img.jpg" ); }': '.bg3 { background: url( "/proxy/http://example.com/img.jpg" ); }',
  '.bg4 { background: url( "/img.jpg" ); }': '.bg4 { background: url( "/proxy/http://localhost:8081/img.jpg" ); }',
  '.bg5 { background: url( "img.jpg" ); }': '.bg5 { background: url( "img.jpg" ); }',
  '.bg4 { background: url(   "/img.jpg"   ); }': '.bg4 { background: url(   "/proxy/http://localhost:8081/img.jpg"   ); }',
  '.bg4 { background: url( "/img.jpg"  ); }': '.bg4 { background: url( "/proxy/http://localhost:8081/img.jpg"  ); }',

  '<script src="http://example.com/scripts.js"></script>': '<script src="/proxy/http://example.com/scripts.js"></script>',
  '<script src="https://example.com/scripts.js"></script>': '<script src="/proxy/https://example.com/scripts.js"></script>',
  '<script src="//example.com/scripts.js"></script>': '<script src="/proxy/http://example.com/scripts.js"></script>',
  '<script src="/scripts.js"></script>': '<script src="/proxy/http://localhost:8081/scripts.js"></script>',
  '<script src="scripts.js"></script>': '<script src="scripts.js"></script>',
  '<script src=\'http://example.com/scripts.js\'></script>': '<script src=\'/proxy/http://example.com/scripts.js\'></script>',
  '<script src=\'https://example.com/scripts.js\'></script>': '<script src=\'/proxy/https://example.com/scripts.js\'></script>',
  '<script src=\'//example.com/scripts.js\'></script>': '<script src=\'/proxy/http://example.com/scripts.js\'></script>',
  '<script src=\'/scripts.js\'></script>': '<script src=\'/proxy/http://localhost:8081/scripts.js\'></script>',
  '<script src=\'scripts.js\'></script>': '<script src=\'scripts.js\'></script>',
  '<script src=http://example.com/scripts.js></script>': '<script src=/proxy/http://example.com/scripts.js></script>',
  '<script src=https://example.com/scripts.js></script>': '<script src=/proxy/https://example.com/scripts.js></script>',
  '<script src=//example.com/scripts.js></script>': '<script src=/proxy/http://example.com/scripts.js></script>',
  '<script src=/scripts.js></script>': '<script src=/proxy/http://localhost:8081/scripts.js></script>',
  '<script src=scripts.js></script>': '<script src=scripts.js></script>',

  '<a href="/site/http/page.html">link with "http" in the url</a>': '<a href="/proxy/http://localhost:8081/site/http/page.html">link with "http" in the url</a>',
  '<a href="/site/https/page.html">link with "https" in the url</a>': '<a href="/proxy/http://localhost:8081/site/https/page.html">link with "https" in the url</a>',
  '<a href="http://localhost:8080">link with port number</a>': '<a href="/proxy/http://localhost:8080">link with port number</a>',
};

var testUri = URL.parse('http://localhost:8081/');
var testPrefix = '/proxy/';

test("should rewrite (or not rewrite) various strings correctly", function(t) {
    _.each(testLines, function(expected, source) {
        var actual = urlPrefix.rewriteUrls(source, testUri, testPrefix);
        t.equal(actual, expected, "Should rewrite '" + source + "' to '" + expected + '"');
    });
    t.end();
});

// todo: add tests for streams split at various locations

// todo: add tests for links pointing to  / and #anchors and a few other oddball locations

// todo: add tests for forms

// todo: add tests for javascript (?)