"use strict";

const fs = require("fs"),
  concat = require("concat-stream"),
  test = require("tap").test,
  hyperquest = require("hyperquest"),
  getServers = require("./test_utils.js").getServers;

const source = fs.readFileSync(__dirname + "/source/short.html");
const expected = fs.readFileSync(__dirname + "/expected/short.html");

test("url_rewriting should support short html documents", function (t) {
  getServers(source, function (err, servers) {
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
  });
});
