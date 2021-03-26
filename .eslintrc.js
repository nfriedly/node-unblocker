"use strict";

module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:prettier/recommended",
    "plugin:node/recommended",
  ],
  env: {
    node: true,
    es6: true,
  },
  rules: {
    // todo: enable these
    //"no-var": "error",
    //"prefer-const": "error",
    strict: "error",
    // 'url.parse' was deprecated in v11, but this lib supports v6+ and the replacement, URL, was only standardized in v10
    // next major release will include a bump of the minimum node.js version, allowing the use of URL and resolving
    // alternatively, we could use https://www.npmjs.com/package/url to avoid the deprecated api but maintain backwards compatibility
    "node/no-deprecated-api": "warn",
  },
  overrides: [
    {
      files: ["examples/*/*.js"],
      rules: {
        "node/no-missing-require": "off",
      },
    },
    {
      files: ["test/**"],
      rules: {
        "node/no-unsupported-features/node-builtins": "off",
      },
    },
  ],
};
