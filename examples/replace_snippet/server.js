"use strict";

const express = require("express");
const unblocker = require("unblocker");

const replaceSnippet = require("./replace_snippet.js");

const app = express();

app.use(
  unblocker({
    responseMiddleware: [
      replaceSnippet({
        processContentTypes: ["text/html"],
        searchFor: /<script type="text\/javascript">\s*BrowserCheck.testForCookies\(\);\s*<\/script>/i,
        replaceWith: "",
      }),
    ],
  })
);

app.get("/", (req, res) =>
  res.redirect("/proxy/https://en.wikipedia.org/wiki/Main_Page")
);

app.listen(8080);

console.log("app listening on port 8080. Test at http://localhost:8080/");
