"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const concat = require("concat-stream");
const { test } = require("node:test");
const hyperquest = require("hyperquest");
const getServers = require("./test_utils.js").getServers;

const source = fs.readFileSync(__dirname + "/source/short.html");
const expected = fs.readFileSync(__dirname + "/expected/short.html");

function getServersAsync(options) {
  return new Promise((resolve, reject) => {
    getServers(options, (err, servers) => {
      if (err) return reject(err);
      resolve(servers);
    });
  });
}

function request(url) {
  return new Promise((resolve, reject) => {
    hyperquest(url).pipe(concat(resolve)).on("error", reject);
  });
}

function closeServers(servers) {
  return new Promise((resolve, reject) => {
    servers.kill((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

test("url_rewriting should support short html documents", async () => {
  const servers = await getServersAsync(source);
  try {
    const data = await request(servers.proxiedUrl);
    assert.strictEqual(
      data.toString(),
      expected.toString().replace(/<remotePort>/g, servers.remotePort)
    );
  } finally {
    await closeServers(servers);
  }
});
