"use strict";

var http = require("http");
var Unblocker = require("unblocker");
var youtube = require("./youtube.js");

var unblocker = Unblocker({
  requestMiddleware: [youtube.processRequest],
});

var server = http
  .createServer(function (req, res) {
    // first let unblocker try to handle the requests
    unblocker(req, res, function (err) {
      // this callback will be fired for any request that unblocker does not serve
      var headers = { "content-type": "text/html" };
      if (err) {
        res.writeHead(500, headers);
        return res.end(err.stack || err);
      }
      if (req.url == "/") {
        res.writeHead(200, headers);
        return res.end(
          'Visit a link such as <a href="/proxy/https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>document.write(window.location)</script>proxy/https://www.youtube.com/watch?v=dQw4w9WgXcQ</a> to see the magic.'
        );
      } else {
        res.writeHead(404, headers);
        return res.end("Error 404: file not found.");
      }
    });
  })
  .listen(8080);

server.on("upgrade", unblocker.onUpgrade);

console.log("proxy server live at http://localhost:8080/");
