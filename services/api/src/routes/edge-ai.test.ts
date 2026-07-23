import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { loadConfigFromEnv } from "../config";
import { buildHermesAssistantReply, planHermesMessage } from "../hermes-agent";
import { registerEdgeAiRoutes, resolveEdgeAiIntent, type EdgeAiIntentResolution } from "./edge-ai";

type EdgeAiEnvelope = {
  success: boolean;
  data?: {
    available?: boolean;
    overallRiskLevel?: string;
    devices?: unknown[];
  };
};

function fetchUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

void test("status degrades to unavailable when Hermes is not configured", async () => {
  const app = Fastify({ logger: false });
  app.decorateRequest("traceId", "edge-ai-test");
  const config = loadConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123",
    AUTH_REQUIRED: "false",
  });
  registerEdgeAiRoutes(app, config, null);

  const response = await app.inject({ method: "GET", url: "/edge-ai/status" });
  const body = response.json<EdgeAiEnvelope>();
  assert.equal(response.statusCode, 200);
  assert.equal(body.success, true);
  const data = body.data;
  assert.ok(data);
  assert.equal(data.available, false);
  assert.equal(data.overallRiskLevel, "unavailable");
  assert.deepEqual(data.devices, []);
  await app.close();
});

void test("unsafe autonomous actions are rejected before any board call", async () => {
  const app = Fastify({ logger: false });
  app.decorateRequest("traceId", "edge-ai-test");
  const config = loadConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123",
    AUTH_REQUIRED: "false",
  });
  registerEdgeAiRoutes(app, config, null);

  const response = await app.inject({
    method: "POST",
    url: "/edge-ai/actions",
    payload: { action: "restart_gateway" },
  });
  assert.equal(response.statusCode, 400);
  await app.close();
});

void test("safe natural-language intents resolve to bounded Hermes actions", () => {
  assert.equal(resolveEdgeAiIntent("帮我检查 B 节点为什么危险").action, "recheck");
  assert.equal(resolveEdgeAiIntent("生成当前态势报告").action, "generate_report");
  assert.equal(resolveEdgeAiIntent("收集 MQTT 链路日志").action, "collect_logs");
});

void test("chat planner dispatches multiple safe tasks in spoken order", () => {
  const plan = planHermesMessage("先诊断链路，再重新研判，最后生成报告");
  assert.equal(plan.blocked, false);
  assert.deepEqual(plan.actions, ["collect_logs", "recheck", "generate_report"]);
});

void test("chat planner can continue the previous audited task plan", () => {
  const plan = planHermesMessage("按刚才的再来一次", ["collect_logs", "generate_report"]);
  assert.deepEqual(plan.actions, ["collect_logs", "generate_report"]);
  assert.equal(plan.blocked, false);
});

void test("chat reply is grounded in completed edge task results", () => {
  const reply = buildHermesAssistantReply(planHermesMessage("诊断链路"), [
    {
      action: "collect_logs",
      label: "诊断链路",
      status: "succeeded",
      summary: "done",
      result: { collectedCommandCount: 6, artifactName: "diagnostic-1.json" },
      error: null,
    },
  ]);
  assert.match(reply, /采集 6 项只读证据/u);
  assert.match(reply, /未接管告警、串口或 MQTT 主链路/u);
});

void test("protected natural-language intents are blocked without a board call", async () => {
  const resolution = resolveEdgeAiIntent("重启网关并修改告警阈值");
  assert.equal(resolution.resolved, false);
  assert.equal(resolution.blocked, true);
  assert.equal(resolution.action, null);

  const app = Fastify({ logger: false });
  app.decorateRequest("traceId", "edge-ai-test");
  const config = loadConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123",
    AUTH_REQUIRED: "false",
  });
  registerEdgeAiRoutes(app, config, null);
  const response = await app.inject({
    method: "POST",
    url: "/edge-ai/intents",
    payload: { intent: "重启网关并修改告警阈值" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json<{
    success: boolean;
    data?: { resolution?: EdgeAiIntentResolution };
  }>();
  assert.equal(body.success, true);
  assert.equal(body.data?.resolution?.blocked, true);
  await app.close();
});

void test("action requests preserve identity and Hermes duplicate semantics", async (context) => {
  const forwarded: { url?: string; body?: unknown } = {};
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    forwarded.url = fetchUrl(input);
    if (typeof init?.body !== "string") throw new Error("expected a JSON request body");
    forwarded.body = JSON.parse(init.body);
    await Promise.resolve();
    return new Response(
      JSON.stringify({
        schema_version: 1,
        accepted: true,
        duplicate: true,
        action: { id: "00000000-0000-4000-8000-000000000101", status: "queued" },
      }),
      { status: 202, headers: { "content-type": "application/json" } }
    );
  });

  const app = Fastify({ logger: false });
  app.decorateRequest("traceId", "edge-ai-test");
  app.decorateRequest("user", null);
  app.addHook("onRequest", async (request) => {
    await Promise.resolve();
    request.user = { userId: "00000000-0000-4000-8000-000000000201", username: "operator-a" };
  });
  const config = loadConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123",
    AUTH_REQUIRED: "false",
    RK3568_HERMES_EDGE_SUPERVISOR_URL: "http://127.0.0.1:18082",
  });
  registerEdgeAiRoutes(app, config, null);

  const response = await app.inject({
    method: "POST",
    url: "/edge-ai/actions",
    payload: {
      action: "recheck",
      intent: "立即复检",
      requestId: "harmonyos:recheck:request-0001",
    },
  });

  assert.equal(response.statusCode, 200);
  const responseBody = response.json<{ data: { duplicate: boolean } }>();
  assert.equal(responseBody.data.duplicate, true);
  assert.equal(forwarded.url, "http://127.0.0.1:18082/v1/actions/recheck");
  assert.deepEqual(forwarded.body, {
    requestId: "harmonyos:recheck:request-0001",
    requestedBy: "app-user:operator-a",
    intent: "立即复检",
  });
  await app.close();
});

void test("single action lookup proxies the Hermes task envelope", async (context) => {
  const actionId = "00000000-0000-4000-8000-000000000102";
  let forwardedUrl = "";
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    forwardedUrl = fetchUrl(input);
    await Promise.resolve();
    return new Response(
      JSON.stringify({
        schema_version: 1,
        accepted: true,
        duplicate: false,
        action: { id: actionId, status: "completed" },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });

  const app = Fastify({ logger: false });
  app.decorateRequest("traceId", "edge-ai-test");
  const config = loadConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123",
    AUTH_REQUIRED: "false",
    RK3568_HERMES_EDGE_SUPERVISOR_URL: "http://127.0.0.1:18082",
  });
  registerEdgeAiRoutes(app, config, null);

  const response = await app.inject({ method: "GET", url: `/edge-ai/actions/${actionId}` });
  const body = response.json<{
    success: boolean;
    data: { duplicate: boolean; action: { id: string; status: string } };
  }>();
  assert.equal(response.statusCode, 200);
  assert.equal(forwardedUrl, `http://127.0.0.1:18082/v1/actions/${actionId}`);
  assert.equal(body.data.duplicate, false);
  assert.equal(body.data.action.id, actionId);
  assert.equal(body.data.action.status, "completed");
  await app.close();
});
