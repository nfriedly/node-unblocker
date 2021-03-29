"use strict";

var fs = require("fs"),
  concat = require("concat-stream"),
  test = require("tap").test,
  hyperquest = require("hyperquest"),
  getServers = require("./test_utils.js").getServers;
const express = require("express");
const Unblocker = require("../lib/unblocker.js");

var sourceContent = fs.readFileSync(__dirname + "/source/index.html");
var expected = fs.readFileSync(__dirname + "/expected/index.html");

test("url_rewriting should support support all kinds of links", function (t) {
  getServers(
    { unblocker: new Unblocker({ clientScripts: false }), sourceContent },
    function (err, servers) {
      t.ifErr(err);
      function cleanup() {
        servers.kill(function () {
          t.end();
        });
      }
      hyperquest(servers.proxiedUrl)
        .pipe(
          concat(function (data) {
            t.equal(
              data.toString(),
              expected.toString().replace(/<remotePort>/g, servers.remotePort)
            );
            cleanup();
          })
        )
        .on("error", function (err) {
          console.error("error retrieving data from proxy", err);
          cleanup();
        });
    }
  );
});

test("should return control to parent when route doesn't match and no referer is sent", function (t) {
  getServers(
    { unblocker: new Unblocker({ clientScripts: false }), sourceContent },
    function (err, servers) {
      t.ifErr(err);
      function cleanup() {
        servers.kill(function () {
          t.end();
        });
      }
      hyperquest(servers.homeUrl)
        .pipe(
          concat(function (data) {
            t.equal(
              data.toString(),
              "this is the home page",
              servers.remotePort
            );
            cleanup();
          })
        )
        .on("error", function (err) {
          console.error("error retrieving robots.txt from proxy", err);
          cleanup();
        });
    }
  );
});

test("should redirect root-relative urls when the correct target can be determined from the referer header", function (t) {
  getServers(
    { unblocker: new Unblocker({ clientScripts: false }), sourceContent },
    function (err, servers) {
      t.ifErr(err);
      function cleanup() {
        servers.kill(function () {
          t.end();
        });
      }
      hyperquest(
        servers.homeUrl + "bar?query_param=new",
        {
          headers: {
            referer: servers.proxiedUrl + "foo?query_param=old",
          },
        },
        function (err, res) {
          t.notOk(err);
          t.equal(res.statusCode, 307, "http status code");
          t.equal(
            res.headers.location,
            servers.proxiedUrl + "bar?query_param=new",
            "redirect location"
          );
          cleanup();
        }
      );
    }
  );
});

test("should redirect root-relative urls when the correct target can be determined from the referer header including for urls that the site is already serving content on", function (t) {
  getServers(
    { unblocker: new Unblocker({ clientScripts: false }), sourceContent },
    function (err, servers) {
      t.ifErr(err);
      function cleanup() {
        servers.kill(function () {
          t.end();
        });
      }
      hyperquest(
        servers.homeUrl,
        {
          headers: {
            referer: servers.proxiedUrl,
          },
        },
        function (err, res) {
          t.notOk(err);
          t.equal(res.statusCode, 307, "http status code");
          t.equal(
            res.headers.location,
            servers.proxiedUrl,
            "redirect location"
          );
          cleanup();
        }
      );
    }
  );
});

test("should NOT redirect http urls that have had the slashes merged (http:/ instead of http:// (#130)", function (t) {
  getServers(
    { unblocker: new Unblocker({ clientScripts: false }), sourceContent },
    function (err, servers) {
      t.ifErr(err);
      function cleanup() {
        servers.kill(function () {
          t.end();
        });
      }
      hyperquest(
        servers.proxiedUrl.replace("/proxy/http://", "/proxy/http:/"),
        function (err, res) {
          t.notOk(err);
          t.equal(res.statusCode, 200, "http status code");
          t.notOk(res.headers.location, "no location header");
          cleanup();
        }
      );
    }
  );
});

test("should redirect http urls that have had the have two occurrences of /prefix/http://", function (t) {
  getServers(
    { unblocker: new Unblocker({ clientScripts: false }), sourceContent },
    function (err, servers) {
      t.ifErr(err);
      function cleanup() {
        servers.kill(function () {
          t.end();
        });
      }
      hyperquest(
        servers.proxiedUrl.replace(
          "/proxy/http://",
          "/proxy/http://proxy/http://"
        ),
        function (err, res) {
          t.notOk(err);
          t.equal(res.statusCode, 307, "http status code");
          t.equal(
            res.headers.location,
            servers.proxiedUrl,
            "redirect location"
          );
          cleanup();
        }
      );
    }
  );
});

test("should redirect http urls that end in a TLD without a /", function (t) {
  getServers(
    { unblocker: new Unblocker({ clientScripts: false }), sourceContent },
    function (err, servers) {
      t.ifErr(err);
      function cleanup() {
        servers.kill(function () {
          t.end();
        });
      }
      hyperquest(
        // strip the trailing /
        servers.proxiedUrl.substr(0, servers.proxiedUrl.length - 1),
        function (err, res) {
          t.notOk(err);
          t.equal(res.statusCode, 307, "http status code");
          t.equal(
            res.headers.location,
            servers.proxiedUrl, // correct URL with the trailing /
            "redirect location"
          );
          cleanup();
        }
      );
    }
  );
});

test("should redirect http urls that end in a TLD without a / when req.protocol is set", function (t) {
  // express sets req.protocol
  const app = express();
  const unblocker = new Unblocker({});
  app.use(unblocker);
  getServers({ app, unblocker, sourceContent }, function (err, servers) {
    t.ifErr(err);
    function cleanup() {
      servers.kill(function () {
        t.end();
      });
    }
    hyperquest(
      // strip the trailing /
      servers.proxiedUrl.substr(0, servers.proxiedUrl.length - 1),
      function (err, res) {
        t.notOk(err);
        t.equal(res.statusCode, 307, "http status code");
        t.equal(
          res.headers.location,
          servers.proxiedUrl, // correct URL with the trailing /
          "redirect location"
        );
        cleanup();
      }
    );
  });
});
