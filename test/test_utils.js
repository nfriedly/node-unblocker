"use strict";

const http = require("http");
const async = require("async");
const { PassThrough } = require("stream");
const Unblocker = require("../lib/unblocker.js");
const concat = require("concat-stream");

function getUnblocker(options) {
  if (options.unblocker) {
    return options.unblocker;
  }
  return new Unblocker({});
}

function getProxyApp(unblocker) {
  function app(req, res) {
    // first let unblocker try to handle the requests
    unblocker(req, res, function (err) {
      // this callback will be fired for any request that unblocker does not serve
      const headers = {
        "content-type": "text/plain",
      };
      if (err) {
        console.error(err);
        res.writeHead(500, headers);
        return res.end(err.stack || err.message);
      }
      if (req.url == "/") {
        res.writeHead(200, headers);
        return res.end("this is the home page");
      } else {
        res.writeHead(404, headers);
        return res.end("Error 404: file not found.");
      }
    });
  }

  return app;
}

/**
 * Creates two servers, a proxy instance and a remote server that serves up sourceContent
 * @param options|sourceContent
 *  - options is an object with one or more of {sourceContent,charset,remoteApp,proxyApp},
 *  or
 *  - sourceContent can be a buffer or string that is automatically served by the default remoteApp
 */
exports.getServersAsync = function (options) {
  return new Promise((resolve, reject) => {
    if (typeof options == "string" || options instanceof Buffer) {
      options = {
        sourceContent: options,
      };
    }

    const remoteApp =
      options.remoteApp ||
      function sendContent(req, res) {
        res.writeHead(200, {
          "content-type":
            "text/html" +
            (options.charset ? "; charset=" + options.charset : ""),
        });
        res.end(options.sourceContent);
      };

    const unblocker = getUnblocker(options);
    const proxyApp = options.proxyApp || getProxyApp(unblocker);

    const proxyServer = http.createServer(proxyApp);
    const remoteServer = http.createServer(remoteApp);

    proxyServer.setTimeout(5000);
    remoteServer.setTimeout(5000);

    proxyServer.on("upgrade", unblocker.onUpgrade);

    async.parallel(
      [
        proxyServer.listen.bind(proxyServer),
        remoteServer.listen.bind(remoteServer),
      ],
      function (err) {
        if (err) return reject(err);
        const ret = {
          proxyServer,
          proxyPort: proxyServer.address().port,
          remoteServer,
          remotePort: remoteServer.address().port,
          kill: function (next) {
            async.parallel(
              [
                remoteServer.close.bind(remoteServer),
                proxyServer.close.bind(proxyServer),
              ],
              next
            );
          },
        };
        ret.homeUrl = "http://localhost:" + ret.proxyPort + "/";
        ret.remoteUrl = "http://localhost:" + ret.remotePort + "/";
        ret.proxiedUrl = ret.homeUrl + "proxy/" + ret.remoteUrl;
        resolve(ret);
      }
    );
  });
};

exports.getData = function () {
  return {
    url: "http://example.com/",
    contentType: "text/html",
    headers: {},
    stream: new PassThrough(),
    clientRequest: {},
    clientResponse: {},
    remoteRequest: {},
    remoteResponse: {
      statusCode: 200,
    },
  };
};

exports.streamToString = function (stream) {
  return new Promise((resolve, reject) => {
    if (typeof stream.setEncoding === "function") {
      stream.setEncoding("utf8");
    }
    stream.pipe(concat(resolve)).on("error", reject);
  });
};

// alias for older tests that used pipeToString
exports.pipeToString = exports.streamToString;

exports.closeServers = function (servers) {
  return new Promise((resolve, reject) => {
    servers.kill(function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
};

exports.requestAndConcat = function (url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        res.pipe(
          concat(function (data) {
            resolve(data.toString());
          })
        );
      })
      .on("error", reject);
  });
};

// Returns raw Buffer (not string) for binary/charset-sensitive comparisons
exports.readUrl = function (url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        res.pipe(concat(resolve)).on("error", reject);
      })
      .on("error", reject);
  });
};
