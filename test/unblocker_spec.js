"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("fs");
const concat = require("concat-stream");
const hyperquest = require("hyperquest");
const getServers = require("./test_utils.js").getServers;
const express = require("express");
const Unblocker = require("../lib/unblocker.js");

const sourceContent = fs.readFileSync(__dirname + "/source/index.html");
const expected = fs.readFileSync(__dirname + "/expected/index.html");

function getServersAsync(options) {
  return new Promise((resolve, reject) => {
    getServers(options, function (err, servers) {
      if (err) {
        return reject(err);
      }
      resolve(servers);
    });
  });
}

function killServersAsync(servers) {
  return new Promise((resolve, reject) => {
    servers.kill(function (err) {
      return err ? reject(err) : resolve();
    });
  });
}

async function requestAndConcat(url) {
  return new Promise((resolve, reject) => {
    hyperquest(url)
      .pipe(
        concat(function (data) {
          resolve(data.toString());
        })
      )
      .on("error", reject);
  });
}

test("url_rewriting should support support all kinds of links", async () => {
  const servers = await getServersAsync({
    unblocker: new Unblocker({ clientScripts: false }),
    sourceContent,
  });

  try {
    const actual = await requestAndConcat(servers.proxiedUrl);
    assert.strictEqual(
      actual,
      expected.toString().replace(/<remotePort>/g, servers.remotePort)
    );
  } finally {
    await killServersAsync(servers);
  }
});

test("should return control to parent when route doesn't match and no referer is sent", async () => {
  const servers = await getServersAsync({
    unblocker: new Unblocker({ clientScripts: false }),
    sourceContent,
  });

  try {
    const actual = await requestAndConcat(servers.homeUrl);
    assert.strictEqual(actual, "this is the home page");
  } finally {
    await killServersAsync(servers);
  }
});

test("should redirect root-relative urls when the correct target can be determined from the referer header", async () => {
  const servers = await getServersAsync({
    unblocker: new Unblocker({ clientScripts: false }),
    sourceContent,
  });

  try {
    await new Promise((resolve, reject) => {
      hyperquest(
        servers.homeUrl + "bar?query_param=new",
        {
          headers: {
            referer: servers.proxiedUrl + "foo?query_param=old",
          },
        },
        function (err, res) {
          if (err) {
            return reject(err);
          }
          assert.strictEqual(res.statusCode, 307, "http status code");
          assert.strictEqual(
            res.headers.location,
            servers.proxiedUrl + "bar?query_param=new",
            "redirect location"
          );
          resolve();
        }
      ).on("error", reject);
    });
  } finally {
    await killServersAsync(servers);
  }
});

test("should redirect root-relative urls when the correct target can be determined from the referer header including for urls that the site is already serving content on", async () => {
  const servers = await getServersAsync({
    unblocker: new Unblocker({ clientScripts: false }),
    sourceContent,
  });

  try {
    await new Promise((resolve, reject) => {
      hyperquest(
        servers.homeUrl,
        {
          headers: {
            referer: servers.proxiedUrl,
          },
        },
        function (err, res) {
          if (err) {
            return reject(err);
          }
          assert.strictEqual(res.statusCode, 307, "http status code");
          assert.strictEqual(
            res.headers.location,
            servers.proxiedUrl,
            "redirect location"
          );
          resolve();
        }
      ).on("error", reject);
    });
  } finally {
    await killServersAsync(servers);
  }
});

test("should NOT redirect http urls that have had the slashes merged (http:/ instead of http:// (#130)", async () => {
  const servers = await getServersAsync({
    unblocker: new Unblocker({ clientScripts: false }),
    sourceContent,
  });

  try {
    await new Promise((resolve, reject) => {
      hyperquest(
        servers.proxiedUrl.replace("/proxy/http://", "/proxy/http:/"),
        function (err, res) {
          if (err) {
            return reject(err);
          }
          assert.strictEqual(res.statusCode, 200, "http status code");
          assert.strictEqual(
            res.headers.location,
            undefined,
            "no location header"
          );
          resolve();
        }
      ).on("error", reject);
    });
  } finally {
    await killServersAsync(servers);
  }
});

test("should redirect http urls that have had the have two occurrences of /prefix/http://", async () => {
  const servers = await getServersAsync({
    unblocker: new Unblocker({ clientScripts: false }),
    sourceContent,
  });

  try {
    await new Promise((resolve, reject) => {
      hyperquest(
        servers.proxiedUrl.replace(
          "/proxy/http://",
          "/proxy/http://proxy/http://"
        ),
        function (err, res) {
          if (err) {
            return reject(err);
          }
          assert.strictEqual(res.statusCode, 307, "http status code");
          assert.strictEqual(
            res.headers.location,
            servers.proxiedUrl,
            "redirect location"
          );
          resolve();
        }
      ).on("error", reject);
    });
  } finally {
    await killServersAsync(servers);
  }
});

test("should redirect http urls that end in a TLD without a /", async () => {
  const servers = await getServersAsync({
    unblocker: new Unblocker({ clientScripts: false }),
    sourceContent,
  });

  try {
    await new Promise((resolve, reject) => {
      hyperquest(
        servers.proxiedUrl.substr(0, servers.proxiedUrl.length - 1),
        function (err, res) {
          if (err) {
            return reject(err);
          }
          assert.strictEqual(res.statusCode, 307, "http status code");
          assert.strictEqual(
            res.headers.location,
            servers.proxiedUrl,
            "redirect location"
          );
          resolve();
        }
      ).on("error", reject);
    });
  } finally {
    await killServersAsync(servers);
  }
});

test("should redirect http urls that end in a TLD without a / when req.protocol is set", async () => {
  const app = express();
  const unblocker = new Unblocker({});
  app.use(unblocker);
  const servers = await getServersAsync({
    app,
    unblocker,
    sourceContent,
  });

  try {
    await new Promise((resolve, reject) => {
      hyperquest(
        servers.proxiedUrl.substr(0, servers.proxiedUrl.length - 1),
        function (err, res) {
          if (err) {
            return reject(err);
          }
          assert.strictEqual(res.statusCode, 307, "http status code");
          assert.strictEqual(
            res.headers.location,
            servers.proxiedUrl,
            "redirect location"
          );
          resolve();
        }
      ).on("error", reject);
    });
  } finally {
    await killServersAsync(servers);
  }
});
