"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");
const {
  getServersAsync,
  closeServers,
  requestAndConcat,
} = require("./test_utils.js");

const source = fs.readFileSync(__dirname + "/source/short.html");
const expected = fs.readFileSync(__dirname + "/expected/short.html");

test("url_rewriting should support short html documents", async () => {
  const servers = await getServersAsync(source);
  try {
    const data = await requestAndConcat(servers.proxiedUrl);
    assert.strictEqual(
      data,
      expected.toString().replace(/<remotePort>/g, servers.remotePort)
    );
  } finally {
    await closeServers(servers);
  }
});
