"use strict";

const express = require("express");
const Unblocker = require("unblocker");
const http = require('http');
const app = express();

const unblocker = Unblocker({
    // config options here...
});

app.use(unblocker);

app.get("/", (req, res) =>
  res.redirect("/proxy/https://en.wikipedia.org/wiki/Main_Page")
);

const server = http.createServer(app);

server.on("upgrade", unblocker.onUpgrade);

server.listen(8080, () => {
  console.log("proxy listening on port 8080 for web and websockets. Test at http://localhost:8080/");
});


