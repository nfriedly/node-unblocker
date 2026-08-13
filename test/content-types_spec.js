"use strict";

const assert = require("node:assert/strict");
const contentTypes = require("../lib/content-types.js");
const { test } = require("node:test");

test("should handle content types with a charset", () => {
  const config = {
    processContentTypes: ["text/html"],
  };
  const data = {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  };
  data.contentType = contentTypes.getType(data);
  assert.ok(contentTypes.shouldProcess(config, data));
});
