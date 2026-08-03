import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { loadConfigFromEnv } from "../config";
import { buildHermesAssistantReply, planHermesMessage } from "../hermes-agent";
import { planHermesWithFallback } from "../hermes-planner";
import { registerEdgeAiRoutes, resolveEdgeAiIntent, type EdgeAiIntentResolution } from "./edge-ai";

type EdgeAiEnvelope = {
  success: boolean;
  data?: {
    reachable?: boolean;
    available?: boolean;
    overallRiskLevel?: string;
    devices?: unknown[];
  };
};

function fetchUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function testJsonObject(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
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
  assert.equal(data.reachable, false);
  assert.equal(data.available, false);
  assert.equal(data.overallRiskLevel, "unavailable");
  assert.deepEqual(data.devices, []);
  await app.close();
});

void test("status keeps RK3568 reachable when edge risk data is unavailable", async (context) => {
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    assert.equal(fetchUrl(input), "http://127.0.0.1:18082/v1/edge-risk");
    await Promise.resolve();
    return new Response(
      JSON.stringify({
        available: false,
        mode: "hermes-edge-risk-agent",
        overallRiskLevel: "unavailable",
        devices: [],
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

  const response = await app.inject({ method: "GET", url: "/edge-ai/status" });
  const body = response.json<EdgeAiEnvelope>();
  assert.equal(response.statusCode, 200);
  assert.equal(body.success, true);
  const data = body.data;
  assert.ok(data);
  assert.equal(data.reachable, true);
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

void test("chat planner accepts natural Chinese variants observed in production", () => {
  const plan = planHermesMessage("先检查当前链路，再收集诊断日志，然后生成报告");
  assert.equal(plan.blocked, false);
  assert.deepEqual(plan.actions, ["collect_logs", "generate_report"]);
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

void test("Hermes uses a validated OpenAI-compatible structured plan", async (context) => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = fetchUrl(input);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-key");
    const parsed: unknown = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as unknown;
    requestBody = testJsonObject(parsed);
    await Promise.resolve();
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                blocked: false,
                reason: "我会先检查链路，再生成态势报告。",
                actions: ["collect_logs", "generate_report"],
                suggestions: [],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
  const config = loadConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123",
    HERMES_LLM_BASE_URL: "http://127.0.0.1:11434/v1/",
    HERMES_LLM_API_KEY: "test-key",
    HERMES_LLM_MODEL: "qwen-test",
    HERMES_LLM_MAX_ATTEMPTS: "1",
  });

  const result = await planHermesWithFallback(config, "检查一下并给我一份汇报", [], [
    { role: "user", content: "检查一下并给我一份汇报" },
  ]);

  assert.equal(requestUrl, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(result.source, "model");
  assert.equal(result.model, "qwen-test");
  assert.equal(result.fallbackReason, null);
  assert.deepEqual(result.plan.actions, ["collect_logs", "generate_report"]);
  const responseFormat = testJsonObject(requestBody.response_format);
  assert.equal(responseFormat.type, "json_schema");
  const jsonSchema = testJsonObject(responseFormat.json_schema);
  assert.equal(jsonSchema.name, "hermes_safe_task_plan");
});

void test("Hermes rejects invalid model actions and falls back to deterministic planning", async (context) => {
  context.mock.method(globalThis, "fetch", async () => {
    await Promise.resolve();
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                blocked: false,
                reason: "执行重启。",
                actions: ["restart_gateway"],
                suggestions: [],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
  const config = loadConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123",
    HERMES_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
    HERMES_LLM_MODEL: "unsafe-test",
    HERMES_LLM_MAX_ATTEMPTS: "1",
  });

  const result = await planHermesWithFallback(config, "生成当前态势报告", [], [
    { role: "user", content: "生成当前态势报告" },
  ]);

  assert.equal(result.source, "deterministic");
  assert.equal(result.fallbackReason, "invalid_response");
  assert.deepEqual(result.plan.actions, ["generate_report"]);
});

void test("Hermes retries a disconnected model and keeps offline-safe rules available", async (context) => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    await Promise.resolve();
    throw new Error("model network unavailable");
  });
  const config = loadConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123",
    HERMES_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
    HERMES_LLM_MODEL: "offline-test",
    HERMES_LLM_MAX_ATTEMPTS: "2",
    HERMES_LLM_COOLDOWN_MS: "30000",
  });

  const result = await planHermesWithFallback(config, "重新研判当前风险", [], [
    { role: "user", content: "重新研判当前风险" },
  ]);

  assert.equal(calls, 2);
  assert.equal(result.source, "deterministic");
  assert.equal(result.fallbackReason, "network_error");
  assert.deepEqual(result.plan.actions, ["recheck"]);

  const immediateFallback = await planHermesWithFallback(config, "生成当前态势报告", [], [
    { role: "user", content: "生成当前态势报告" },
  ]);
  assert.equal(calls, 2);
  assert.equal(immediateFallback.source, "deterministic");
  assert.equal(immediateFallback.fallbackReason, "circuit_open");
  assert.deepEqual(immediateFallback.plan.actions, ["generate_report"]);
});

void test("protected intents are blocked before the configured model is called", async (context) => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", () => {
    calls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
  const config = loadConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123",
    HERMES_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
    HERMES_LLM_MODEL: "should-not-run",
  });

  const result = await planHermesWithFallback(config, "重启网关并修改告警阈值");

  assert.equal(calls, 0);
  assert.equal(result.source, "deterministic");
  assert.equal(result.plan.blocked, true);
  assert.deepEqual(result.plan.actions, []);
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
