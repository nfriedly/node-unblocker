"use strict";

const express = require("express");
const Unblocker = require("unblocker");

const blacklist = require("./blacklist.js");

const app = express();

const unblocker = Unblocker({
  requestMiddleware: [
    blacklist({
      blockedDomains: ["example.com"],
      message: "The requested url is not permitted.",
    }),
  ],
});

app.use(unblocker);

app.get("/", (req, res) =>
  res.redirect("/proxy/https://en.wikipedia.org/wiki/Main_Page")
);

app.listen(8080).on("upgrade", unblocker.onUpgrade);

console.log("app listening on port 8080. Test at http://localhost:8080/");
