"use strict";

const express = require("express");
const unblocker = require("unblocker");
const app = express();

app.use(
  unblocker({
    // config options here...
  })
);

app.get("/", (req, res) =>
  res.redirect("/proxy/https://en.wikipedia.org/wiki/Main_Page")
);

app.listen(8080);

console.log("app listening on port 8080. Test at http://localhost:8080/");
