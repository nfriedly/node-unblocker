"use strict";

const { test } = require("tap");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const concat = require("concat-stream");
const { getServers } = require("./test_utils.js");
const Unblocker = require("../lib/unblocker.js");

// source is http://qa-dev.w3.org/wmvs/HEAD/dev/tests/xhtml-windows-1250.xhtml which is linked to from http://validator.w3.org/dev/tests/#encoding
const sourceContent = fs.readFileSync(
  __dirname + "/source/xhtml-windows-1250.xhtml"
);
const expected = fs.readFileSync(
  __dirname + "/expected/xhtml-windows-1250-converted-to-utf-8.xhtml"
);

// first validate that the IDE or whatever didn't change the file encoding
const SOURCE_HASH = "11f694099b205b26a19648ab22602b39c6deb125";
const EXPECTED_HASH = "4a04a0aa660da6f0eec9534c0e25212a7045ea7c";
test("source and expected xhtml-windows-1250.xhtml files should not have changed", function (t) {
  t.equal(
    crypto.createHash("sha1").update(sourceContent).digest("hex"),
    SOURCE_HASH
  );
  t.equal(
    crypto.createHash("sha1").update(expected).digest("hex"),
    EXPECTED_HASH
  );
  t.end();
});

test("should properly decode and update non-native charsets when charset is in header", function (t) {
  t.plan(1);
  getServers(
    {
      unblocker: new Unblocker({ clientScripts: false }),
      sourceContent,
      charset: "windows-1250",
    },
    function (err, servers) {
      http
        .get(servers.proxiedUrl, function (res) {
          res.pipe(
            concat(function (actual) {
              servers.kill();
              t.same(actual, expected);
            })
          );
        })
        .on("error", function (e) {
          t.bailout(e);
        });
    }
  );
});

test("should properly decode and update charsets when charset is in body", function (t) {
  t.plan(1);
  getServers(
    { unblocker: new Unblocker({ clientScripts: false }), sourceContent },
    function (err, servers) {
      http
        .get(servers.proxiedUrl, function (res) {
          res.pipe(
            concat(function (actual) {
              servers.kill();
              t.same(actual, expected);
            })
          );
        })
        .on("error", function (e) {
          t.bailout(e);
        });
    }
  );
});

test("should still work when charset can be determined", function (t) {
  t.plan(1);
  const sourceContent = "<h1>test</h1>";
  const expected = "<h1>test</h1>";
  getServers(
    { unblocker: new Unblocker({ clientScripts: false }), sourceContent },
    function (err, servers) {
      http
        .get(servers.proxiedUrl, function (res) {
          res.pipe(
            concat(function (actual) {
              servers.kill();
              t.same(actual.toString(), expected);
            })
          );
        })
        .on("error", function (e) {
          t.bailout(e);
        });
    }
  );
});
