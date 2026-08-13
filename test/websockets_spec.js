"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("fs");
const { URL } = require("url");
const WebSocket = require("ws");
const getServers = require("./test_utils.js").getServers;

const sourceContent = fs.readFileSync(__dirname + "/source/index.html");

function getServersAsync(options) {
  return new Promise((resolve, reject) => {
    getServers(options, function (err, servers) {
      if (err) return reject(err);
      resolve(servers);
    });
  });
}

test("it should pass text messages over a websocket connection", async () => {
  const servers = await getServersAsync({ sourceContent });
  const wss = new WebSocket.Server({ server: servers.remoteServer });

  await new Promise((resolve, reject) => {
    wss.on("connection", function connection(ws) {
      ws.on("message", function incoming(message) {
        assert.strictEqual(message.toString(), "message from client");
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
      assert.strictEqual(message.toString(), "message from server");
      ws.close();
      servers.kill(function (err) {
        return err ? reject(err) : resolve();
      });
    });

    ws.on("error", reject);
  });
});

test("it should pass binary messages over a websocket connection", async () => {
  const servers = await getServersAsync({ sourceContent });
  const wss = new WebSocket.Server({ server: servers.remoteServer });

  await new Promise((resolve, reject) => {
    wss.on("connection", function connection(ws) {
      ws.on("message", function incoming(message) {
        assert.deepStrictEqual(
          Uint8Array.from(message),
          Uint8Array.from([1, 2, 3, 4, 5])
        );
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
      assert.deepStrictEqual(
        Uint8Array.from(message),
        Uint8Array.from([5, 4, 3, 2, 1])
      );
      ws.close();
      servers.kill(function (err) {
        return err ? reject(err) : resolve();
      });
    });

    ws.on("error", reject);
  });
});

test("it should forward the path in a websocket requests", async () => {
  const servers = await getServersAsync({ sourceContent });
  const wss = new WebSocket.Server({ server: servers.remoteServer });

  await new Promise((resolve, reject) => {
    wss.on("connection", function connection(ws, req) {
      assert.strictEqual(req.url, "/websocket-path");
      ws.close();
      servers.kill(function (err) {
        return err ? reject(err) : resolve();
      });
    });

    const wsurl = new URL(servers.proxiedUrl + "websocket-path");
    wsurl.protocol = "ws:";
    new WebSocket(wsurl.href).on("error", reject);
  });
});

test("it should forward the path in a websocket requests when the prefix is missing but a referer header is avaliable", async () => {
  const servers = await getServersAsync({ sourceContent });
  const wss = new WebSocket.Server({ server: servers.remoteServer });

  await new Promise((resolve, reject) => {
    wss.on("connection", function connection(ws, req) {
      assert.strictEqual(req.url, "/websocket-path");
      ws.close();
      servers.kill(function (err) {
        return err ? reject(err) : resolve();
      });
    });

    const wsurl = new URL(servers.homeUrl + "websocket-path");
    wsurl.protocol = "ws:";
    new WebSocket(wsurl.href, { headers: { referer: servers.proxiedUrl } }).on(
      "error",
      reject
    );
  });
});

test("it should close the connection when unable to determine the target url", async () => {
  const servers = await getServersAsync({ sourceContent });

  await new Promise((resolve, reject) => {
    const wsurl = new URL(servers.homeUrl + "websocket-path");
    wsurl.protocol = "ws:";
    const ws = new WebSocket(wsurl.href);

    ws.on("unexpected-response", (req, res) => {
      assert.strictEqual(res.statusCode, 400);
      servers.kill(function (err) {
        return err ? reject(err) : resolve();
      });
    });

    ws.on("error", reject);
  });
});

test("it should forward the close reason from the client to the remote server", async () => {
  const servers = await getServersAsync({ sourceContent });
  const wss = new WebSocket.Server({ server: servers.remoteServer });

  await new Promise((resolve, reject) => {
    wss.on("connection", function connection(ws) {
      assert.ok(ws, "server connection event");
      ws.on("close", function (code, reason) {
        assert.strictEqual(code, 1008);
        assert.strictEqual(
          reason.toString(),
          "Policy Violation (sent from client)"
        );
        servers.kill(function (err) {
          return err ? reject(err) : resolve();
        });
      });
    });

    const wsurl = new URL(servers.proxiedUrl + "websocket-path");
    wsurl.protocol = "ws:";
    const wsc = new WebSocket(wsurl.href);
    wsc.on("open", function () {
      assert.ok(true, "client open event");
      wsc.close(1008, "Policy Violation (sent from client)");
    });
    wsc.on("error", reject);
  });
});

test("it should forward the close reason from the remote server to the client", async () => {
  const servers = await getServersAsync({ sourceContent });
  const wss = new WebSocket.Server({ server: servers.remoteServer });

  await new Promise((resolve, reject) => {
    wss.on("connection", function connection(ws) {
      assert.ok(ws, "server connection event");
      ws.close(1008, "Policy Violation (sent from server)");
    });

    const wsurl = new URL(servers.proxiedUrl + "websocket-path");
    wsurl.protocol = "ws:";
    const wsc = new WebSocket(wsurl.href);
    wsc.on("close", function (code, reason) {
      assert.strictEqual(code, 1008);
      assert.strictEqual(
        reason.toString(),
        "Policy Violation (sent from server)"
      );
      servers.kill(function (err) {
        return err ? reject(err) : resolve();
      });
    });
    wsc.on("error", reject);
  });
});

// todo: close cleanly from client, ensure server connection is closed cleanly and vice versa
// todo: exit abruptly from client, ensure server connection is closed cleanly and vice versa
