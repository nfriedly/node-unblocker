"use strict";

var fs = require("fs"),
  test = require("tap").test,
  getServers = require("./test_utils.js").getServers;
const WebSocket = require("ws");

var sourceContent = fs.readFileSync(__dirname + "/source/index.html");

test("it should pass text messages over a websocket connection", function (t) {
  t.plan(3);
  getServers({ sourceContent }, function (err, servers) {
    t.error(err);

    const wss = new WebSocket.Server({ server: servers.remoteServer });
    wss.on("connection", function connection(ws) {
      ws.on("message", function incoming(message) {
        t.equal(message, "message from client");
      });

      ws.send("message from server");
    });

    const wsurl = new URL(servers.proxiedUrl);
    wsurl.protocol = "ws:";
    const ws = new WebSocket(wsurl.href);

    ws.on("open", function open() {
      ws.send("message from client");
    });

    ws.on("message", function incoming(message) {
      t.equal(message, "message from server");
      ws.close();
      servers.kill(function () {
        t.end();
      });
    });
  });
});

test("it should pass binary messages over a websocket connection", function (t) {
  t.plan(3);
  getServers({ sourceContent }, function (err, servers) {
    t.error(err);

    const wss = new WebSocket.Server({ server: servers.remoteServer });
    wss.on("connection", function connection(ws) {
      ws.on("message", function incoming(message) {
        t.same(Uint8Array.from(message), Uint8Array.from([1, 2, 3, 4, 5]));
      });

      ws.send(Uint8Array.from([5, 4, 3, 2, 1]));
    });

    const wsurl = new URL(servers.proxiedUrl);
    wsurl.protocol = "ws:";
    const ws = new WebSocket(wsurl.href);

    ws.on("open", function open() {
      ws.send(Uint8Array.from([1, 2, 3, 4, 5]));
    });

    ws.on("message", function incoming(message) {
      t.same(Uint8Array.from(message), Uint8Array.from([5, 4, 3, 2, 1]));
      ws.close();
      servers.kill(function () {
        t.end();
      });
    });
  });
});
