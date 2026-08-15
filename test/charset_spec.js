"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { getServersAsync, closeServers, readUrl } = require("./test_utils.js");
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

test("source and expected xhtml-windows-1250.xhtml files should not have changed", () => {
  assert.strictEqual(
    crypto.createHash("sha1").update(sourceContent).digest("hex"),
    SOURCE_HASH
  );
  assert.strictEqual(
    crypto.createHash("sha1").update(expected).digest("hex"),
    EXPECTED_HASH
  );
});

test("should properly decode and update non-native charsets when charset is in header", async () => {
  const servers = await getServersAsync({
    unblocker: new Unblocker({ clientScripts: false }),
    sourceContent,
    charset: "windows-1250",
  });

  try {
    const actual = await readUrl(servers.proxiedUrl);
    assert.deepStrictEqual(actual, expected);
  } finally {
    await closeServers(servers);
  }
});

test("should properly decode and update charsets when charset is in body", async () => {
  const servers = await getServersAsync({
    unblocker: new Unblocker({ clientScripts: false }),
    sourceContent,
  });

  try {
    const actual = await readUrl(servers.proxiedUrl);
    assert.deepStrictEqual(actual, expected);
  } finally {
    await closeServers(servers);
  }
});

test("should still work when charset can be determined", async () => {
  const sourceContent = "<h1>test</h1>";
  const expectedValue = "<h1>test</h1>";
  const servers = await getServersAsync({
    unblocker: new Unblocker({ clientScripts: false }),
    sourceContent,
  });

  try {
    const actual = await readUrl(servers.proxiedUrl);
    assert.strictEqual(actual.toString(), expectedValue);
  } finally {
    await closeServers(servers);
  }
});
