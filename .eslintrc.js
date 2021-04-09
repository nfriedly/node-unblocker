"use strict";

module.exports = {
  plugins: ["clean-regex"],
  extends: [
    "eslint:recommended",
    "plugin:prettier/recommended",
    "plugin:node/recommended",
    "plugin:clean-regex/recommended",
  ],
  env: {
    node: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  rules: {
    // todo: enable these
    //"no-var": "error",
    //"prefer-const": "error",
    strict: "error",
    "no-unsafe-optional-chaining": "error",
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
  ignorePatterns: ["test/source/", "test/expected/"],
};
