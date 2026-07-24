const assert = require("node:assert/strict");
const test = require("node:test");

const { KeyedSerialQueue } = require("../dist/keyed-serial-queue.js");

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("runs tasks for the same key strictly in submission order", async () => {
  const queue = new KeyedSerialQueue();
  const releaseFirst = deferred();
  const events = [];

  const first = queue.run("telemetry/device-a", async () => {
    events.push("first:start");
    await releaseFirst.promise;
    events.push("first:end");
  });
  const second = queue.run("telemetry/device-a", async () => {
    events.push("second:start");
    events.push("second:end");
  });

  await nextTurn();
  assert.deepEqual(events, ["first:start"]);
  releaseFirst.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start", "second:end"]);
});

test("allows different keys to run in parallel", async () => {
  const queue = new KeyedSerialQueue();
  const release = deferred();
  const started = [];

  const first = queue.run("telemetry/device-a", async () => {
    started.push("a");
    await release.promise;
  });
  const second = queue.run("telemetry/device-b", async () => {
    started.push("b");
    await release.promise;
  });

  await nextTurn();
  assert.deepEqual(new Set(started), new Set(["a", "b"]));
  release.resolve();
  await Promise.all([first, second]);
});

test("continues a key after a task fails", async () => {
  const queue = new KeyedSerialQueue();
  const failed = queue.run("telemetry/device-a", async () => {
    throw new Error("expected failure");
  });
  const recovered = queue.run("telemetry/device-a", async () => "recovered");

  await assert.rejects(failed, /expected failure/);
  assert.equal(await recovered, "recovered");
});

test("removes idle keys after their tails finish", async () => {
  const queue = new KeyedSerialQueue();
  await queue.run("telemetry/device-a", async () => undefined);
  await queue.waitForIdle();
  assert.equal(queue.activeKeyCount, 0);
});
