/* eslint-env node */
"use strict";

module.exports = {
  root: true, // there's apparently no other way to not have the "plugin:node/recommended" rules applied here :/
  extends: ["eslint:recommended", "plugin:prettier/recommended"],
  env: {
    node: false,
    browser: true,
  },
  rules: {
    strict: "error",
  },
};
