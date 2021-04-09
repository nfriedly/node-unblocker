"use strict";

const { test } = require("tap");
const contentTypes = require("../lib/content-types.js");

test("should handle content types with a charset", function (t) {
  const config = {
    processContentTypes: ["text/html"],
  };
  const data = {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  };
  data.contentType = contentTypes.getType(data);
  t.ok(contentTypes.shouldProcess(config, data));
  t.end();
});
