"use strict";

const fs = require("fs");
const { test } = require("tap");
const { getServers } = require("./test_utils.js");
const WebSocket = require("ws");

const sourceContent = fs.readFileSync(__dirname + "/source/index.html");

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

test("it should forward the path in a websocket requests", function (t) {
  t.plan(2);
  getServers({ sourceContent }, function (err, servers) {
    t.error(err);

    const wss = new WebSocket.Server({ server: servers.remoteServer });
    wss.on("connection", function connection(ws, req) {
      t.equal(req.url, "/websocket-path");
      ws.close();
      servers.kill(function () {
        t.end();
      });
    });

    const wsurl = new URL(servers.proxiedUrl + "websocket-path");
    wsurl.protocol = "ws:";
    new WebSocket(wsurl.href);
  });
});

test("it should forward the path in a websocket requests when the prefix is missing but a referer header is available", function (t) {
  t.plan(2);
  getServers({ sourceContent }, function (err, servers) {
    t.error(err);

    const wss = new WebSocket.Server({ server: servers.remoteServer });
    wss.on("connection", function connection(ws, req) {
      t.equal(req.url, "/websocket-path");
      ws.close();
      servers.kill(function () {
        t.end();
      });
    });

    const wsurl = new URL(servers.homeUrl + "websocket-path");
    wsurl.protocol = "ws:";
    new WebSocket(wsurl.href, { headers: { referer: servers.proxiedUrl } });
  });
});

test("it should close the connection when unable to determine the target url", function (t) {
  t.plan(2);
  getServers({ sourceContent }, function (err, servers) {
    t.error(err);

    const wsurl = new URL(servers.homeUrl + "websocket-path");
    wsurl.protocol = "ws:";
    const ws = new WebSocket(wsurl.href);
    ws.on("unexpected-response", (req, res) => {
      t.equal(res.statusCode, 400);
      servers.kill(function () {
        t.end();
      });
    });
  });
});

test("it should forward the close reason from the client to the remote server", function (t) {
  t.plan(5);
  getServers({ sourceContent }, function (err, servers) {
    t.error(err);

    const wss = new WebSocket.Server({ server: servers.remoteServer });
    wss.on("connection", function connection(ws /*, req*/) {
      t.ok(ws, "server connection event");
      ws.on("close", function (code, reason) {
        t.equal(code, 1008);
        t.equal(reason, "Policy Violation (sent from client)");
        servers.kill(function () {
          t.end();
        });
      });
    });

    const wsurl = new URL(servers.proxiedUrl + "websocket-path");
    wsurl.protocol = "ws:";
    const wsc = new WebSocket(wsurl.href);
    wsc.on("open", function () {
      t.ok(true, "client open event");
      wsc.close(1008, "Policy Violation (sent from client)");
    });
  });
});

test("it should forward the close reason from the remote server to the client", function (t) {
  t.plan(4);
  getServers({ sourceContent }, function (err, servers) {
    t.error(err);

    const wss = new WebSocket.Server({ server: servers.remoteServer });
    wss.on("connection", function connection(ws /*, req*/) {
      t.ok(ws, "server connection event");
      ws.close(1008, "Policy Violation (sent from server)");
    });

    const wsurl = new URL(servers.proxiedUrl + "websocket-path");
    wsurl.protocol = "ws:";
    const wsc = new WebSocket(wsurl.href);
    wsc.on("close", function (code, reason) {
      t.equal(code, 1008);
      t.equal(reason, "Policy Violation (sent from server)");
      servers.kill(function () {
        t.end();
      });
    });
  });
});
// todo: close cleanly from client, ensure server connection is closed cleanly and vice versa
// todo: exit abruptly from client, ensure server connection is closed cleanly and vice versa
