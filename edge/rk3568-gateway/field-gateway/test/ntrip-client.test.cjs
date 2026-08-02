const assert = require("node:assert/strict");
const net = require("node:net");
const test = require("node:test");

const { NtripClient } = require("../dist/ntrip-client.js");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("NTRIP client accepts ICY 200, sends GGA, streams body bytes and never exposes credentials in stats", async () => {
  const rtcm = Buffer.from([0xd3, 0x00, 0x02, 0x43, 0x20, 0xaa, 0xbb, 0xcc]);
  let request = "";
  let gga = "";
  const server = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      const text = chunk.toString("latin1");
      if (!request.includes("\r\n\r\n")) {
        request += text;
        if (request.includes("\r\n\r\n")) {
          socket.write(Buffer.concat([
            Buffer.from("ICY 200 OK\r\nServer: fake-caster\r\n\r\n", "latin1"),
            rtcm
          ]));
        }
      } else {
        gga += text;
      }
    });
  });
  const port = await listen(server);
  let streamed = Buffer.alloc(0);
  let resolveData;
  const gotData = new Promise((resolve) => { resolveData = resolve; });
  const client = new NtripClient({
    host: "127.0.0.1",
    port,
    mountpoint: "AUTO",
    username: "test-user",
    password: "secret-value",
    ggaIntervalMs: 1000,
    connectTimeoutMs: 2000,
    reconnectBaseDelayMs: 1000,
    reconnectMaxDelayMs: 2000
  }, {
    getGga: () => "$GNGGA,000000.00,2436.0000000,N,11807.0000000,E,1,12,1.00,0.000,M,0.000,M,,*6A\r\n",
    onData: (chunk) => {
      streamed = Buffer.concat([streamed, chunk]);
      resolveData();
    }
  });

  client.start();
  await Promise.race([
    gotData,
    new Promise((_, reject) => setTimeout(() => reject(new Error("fake caster data timeout")), 3000))
  ]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  client.stop();

  assert.match(request, /^GET \/AUTO HTTP\/1\.0\r\n/mu);
  assert.match(request, /Authorization: Basic dGVzdC11c2VyOnNlY3JldC12YWx1ZQ==\r\n/u);
  assert.deepEqual(streamed, rtcm);
  assert.match(gga, /^\$GNGGA,/u);
  const serializedStats = JSON.stringify(client.stats());
  assert.equal(serializedStats.includes("test-user"), false);
  assert.equal(serializedStats.includes("secret-value"), false);
  assert.equal(client.stats().successfulConnections, 1);
  await close(server);
});

test("NTRIP client rejects non-200 caster responses without forwarding body data", async () => {
  const server = net.createServer((socket) => {
    socket.once("data", () => socket.end("HTTP/1.1 401 Unauthorized\r\n\r\nnope"));
  });
  const port = await listen(server);
  let chunks = 0;
  const client = new NtripClient({
    host: "127.0.0.1",
    port,
    mountpoint: "AUTO",
    username: "u",
    password: "p",
    ggaIntervalMs: 1000,
    connectTimeoutMs: 2000,
    reconnectBaseDelayMs: 5000,
    reconnectMaxDelayMs: 5000
  }, { getGga: () => null, onData: () => { chunks += 1; } });
  client.start();
  await new Promise((resolve) => setTimeout(resolve, 100));
  client.stop();
  assert.equal(chunks, 0);
  assert.match(client.stats().lastError, /401 Unauthorized/u);
  await close(server);
});

test("NTRIP client accepts a bare ICY status line followed by RTCM", async () => {
  const rtcm = Buffer.from([0xd3, 0x00, 0x02, 0x43, 0x20, 0xaa, 0xbb, 0xcc]);
  const server = net.createServer((socket) => {
    socket.once("data", () => {
      socket.write("ICY 200 OK\r\n", "latin1");
      setTimeout(() => socket.write(rtcm), 10);
    });
  });
  const port = await listen(server);
  let streamed = Buffer.alloc(0);
  let resolveData;
  const gotData = new Promise((resolve) => { resolveData = resolve; });
  const client = new NtripClient({
    host: "127.0.0.1",
    port,
    mountpoint: "AUTO",
    username: "u",
    password: "p",
    ggaIntervalMs: 1000,
    connectTimeoutMs: 2000,
    reconnectBaseDelayMs: 5000,
    reconnectMaxDelayMs: 5000
  }, {
    getGga: () => null,
    onData: (chunk) => {
      streamed = Buffer.concat([streamed, chunk]);
      resolveData();
    }
  });

  client.start();
  await Promise.race([
    gotData,
    new Promise((_, reject) => setTimeout(() => reject(new Error("bare ICY data timeout")), 3000))
  ]);
  client.stop();

  assert.deepEqual(streamed, rtcm);
  assert.equal(client.stats().lastStatusLine, "ICY 200 OK");
  assert.equal(client.stats().successfulConnections, 1);
  await close(server);
});
