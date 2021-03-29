"use strict";

const express = require("express");
const Unblocker = require("unblocker");
const app = express();
const unblocker = Unblocker({
  // config options here...
});

app.use(unblocker);

app.get("/", (req, res) =>
  res.redirect("/proxy/https://en.wikipedia.org/wiki/Main_Page")
);

// start the server and allow unblocker to proxy websockets:
app.listen(process.env.PORT || 8080).on("upgrade", unblocker.onUpgrade);
// or
// const http = require("http");
// const server = http.createServer(app);
// server.listen(8080);
// server.on("upgrade", unblocker.onUpgrade);

console.log("app listening on port 8080. Test at http://localhost:8080/");
