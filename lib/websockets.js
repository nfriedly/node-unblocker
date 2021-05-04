"use strict";
var http = require("http"),
  https = require("https");
var debugWS = require("debug")("unblocker:websocket");

module.exports = function (config) {
  function proxyWebsocket(data) {
    const { uri, clientSocket, clientHead } = data;

    var onError = function () {
      console.error("error", arguments);
      clientSocket.end();
    };

    // todo: make a way for middleware to short-circuit the request
    config.requestMiddleware.forEach((middleware) => middleware(data));

    var options = {
      host: uri.hostname,
      port: uri.port,
      path: uri.path,
      method: data.clientRequest.method,
      headers: data.headers,
    };

    //set the agent for the request.
    if (uri.protocol == "http:" && config.httpAgent) {
      options.agent = config.httpAgent;
    }
    if (uri.protocol == "https:" && config.httpsAgent) {
      options.agent = config.httpsAgent;
    }

    // what protocol to use for outgoing connections.
    var proto = uri.protocol == "https:" ? https : http;

    debugWS("sending remote request: ", options);

    data.remoteRequest = proto.request(options, function (remoteResponse) {
      debugWS("websocket remote response recieved");
      data.remoteResponse = remoteResponse;
      data.remoteResponse.on("error", onError);
    });

    data.remoteRequest.on("error", onError);

    if (clientHead && clientHead.length) {
      debugWS("sending clientHead", clientHead);
      data.remoteRequest.write(clientHead);
    }

    data.remoteRequest.end(); // Done sending opening data. Doesn't prevent upgrade event or close the connection.

    data.remoteRequest.on(
      "upgrade",
      function (remoteResponse, remoteSocket, remoteHead) {
        debugWS("websocket proxy established", remoteResponse.rawHeaders);

        var key = true;
        var headers = "HTTP/1.1 101 Web Socket Protocol Handshake\r\n";
        remoteResponse.rawHeaders.forEach(function (val) {
          headers += val + (key ? ": " : "\r\n");
          key = !key;
        });
        headers += "\r\n";

        debugWS("sending headers", headers);

        clientSocket.write(headers);

        data.remoteResponse = remoteResponse;

        if (remoteHead && remoteHead.length) {
          debugWS("sending remoteHead", remoteHead);
          clientSocket.write(remoteHead);
        }
        clientSocket.pipe(remoteSocket);
        remoteSocket.pipe(clientSocket);

        clientSocket.on("error", function (err) {
          debugWS("error in client socket", err);
          remoteSocket.end();
          clientSocket.end();
        });

        remoteSocket.on("error", function (err) {
          debugWS("error in remote socket", err);
          clientSocket.end();
          remoteSocket.end();
        });

        if (debugWS.enabled) {
          // data dump
          clientSocket.on("data", function (chunk) {
            debugWS("from ws client: ", chunk.toString());
          });
          remoteSocket.on("data", function (chunk) {
            debugWS("from ws remote: ", chunk.toString());
          });
        }
      }
    );
  }

  return proxyWebsocket;
};
