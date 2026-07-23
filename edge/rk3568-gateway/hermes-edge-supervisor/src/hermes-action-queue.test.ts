import assert from "node:assert/strict";
import test from "node:test";
import {
  HermesActionConflictError,
  HermesActionQueue,
  HermesActionQueueFullError,
  type HermesActionRequest,
} from "./hermes-action-queue";

function request(requestId: string, action: HermesActionRequest["action"] = "recheck") {
  return {
    requestId,
    action,
    requestedBy: "harmonyos:test-user",
    naturalLanguageIntent: null,
  } satisfies HermesActionRequest;
}

void test("duplicate request IDs execute once and return the same task", async () => {
  let executions = 0;
  const queue = new HermesActionQueue({
    maxOutstanding: 4,
    execute: async () => {
      executions += 1;
      return { summary: "done", result: { reportReady: true } };
    },
  });

  const first = await queue.enqueue(request("app-request-0001"));
  const duplicate = await queue.enqueue(request("app-request-0001"));
  await queue.waitForIdle();

  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.action.id, first.action.id);
  assert.equal(executions, 1);
  assert.equal(queue.get(first.action.id)?.status, "completed");
});

void test("actions execute serially even when requests arrive concurrently", async () => {
  let active = 0;
  let maxActive = 0;
  const order: string[] = [];
  const queue = new HermesActionQueue({
    maxOutstanding: 4,
    execute: async (entry) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`start:${entry.requestId}`);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      order.push(`end:${entry.requestId}`);
      active -= 1;
      return { summary: "done", result: {} };
    },
  });

  await Promise.all([
    queue.enqueue(request("app-request-0002")),
    queue.enqueue(request("app-request-0003", "generate_report")),
  ]);
  await queue.waitForIdle();

  assert.equal(maxActive, 1);
  assert.deepEqual(order, [
    "start:app-request-0002",
    "end:app-request-0002",
    "start:app-request-0003",
    "end:app-request-0003",
  ]);
});

void test("queue capacity and conflicting request reuse fail closed", async () => {
  let release!: () => void;
  const queue = new HermesActionQueue({
    maxOutstanding: 1,
    execute: () =>
      new Promise((resolve) => {
        release = () => resolve({ summary: "done", result: {} });
      }),
  });

  await queue.enqueue(request("app-request-0004"));
  await assert.rejects(
    () => queue.enqueue(request("app-request-0005")),
    HermesActionQueueFullError
  );
  await assert.rejects(
    () => queue.enqueue(request("app-request-0004", "collect_logs")),
    HermesActionConflictError
  );
  release();
  await queue.waitForIdle();
});

void test("transition persistence failures do not wedge the serial executor", async () => {
  const persistenceErrors: string[] = [];
  let executions = 0;
  const queue = new HermesActionQueue({
    maxOutstanding: 2,
    execute: async () => {
      executions += 1;
      return { summary: "done", result: {} };
    },
    onTransition: async () => {
      throw new Error("disk unavailable");
    },
    onTransitionError: (error, action) => {
      persistenceErrors.push(`${action.status}:${error instanceof Error ? error.message : String(error)}`);
    },
  });

  const first = await queue.enqueue(request("app-request-0007"));
  const second = await queue.enqueue(request("app-request-0008"));
  await queue.waitForIdle();

  assert.equal(executions, 2);
  assert.equal(queue.get(first.action.id)?.status, "completed");
  assert.equal(queue.get(second.action.id)?.status, "completed");
  assert.deepEqual(queue.status(), { queued: 0, running: 0, capacity: 2 });
  assert.equal(persistenceErrors.length, 6);
});

void test("interrupted persisted actions become failed instead of being replayed", async () => {
  const transitions: string[] = [];
  const queue = new HermesActionQueue({
    maxOutstanding: 4,
    execute: async () => ({ summary: "unused", result: {} }),
    onTransition: async (action) => {
      transitions.push(action.status);
    },
  });
  await queue.restore([
    {
      id: "00000000-0000-4000-8000-000000000001",
      requestId: "app-request-0006",
      createdAt: "2026-07-23T00:00:00.000Z",
      startedAt: "2026-07-23T00:00:01.000Z",
      completedAt: null,
      action: "recheck",
      status: "running",
      requestedBy: "harmonyos:test-user",
      naturalLanguageIntent: null,
      summary: "running",
      result: {},
      error: null,
    },
  ]);

  const restored = queue.list()[0];
  assert.equal(restored?.status, "failed");
  assert.equal(restored?.error, "service_restarted_before_completion");
  assert.deepEqual(transitions, ["failed"]);
});
