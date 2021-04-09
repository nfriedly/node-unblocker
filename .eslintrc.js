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
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  rules: {
    // todo: enable these
    "no-var": "error",
    "one-var": ["error", "never"],
    "prefer-const": "error",
    "prefer-destructuring": "error",
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
  ],
  ignorePatterns: ["test/source/", "test/expected/"],
};
