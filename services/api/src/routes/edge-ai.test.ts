import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { loadConfigFromEnv } from "../config";
import { buildHermesAssistantReply, planHermesMessage } from "../hermes-agent";
import { planHermesWithFallback } from "../hermes-planner";
import type { PgPool } from "../postgres";
import { registerEdgeAiRoutes, resolveEdgeAiIntent, type EdgeAiIntentResolution } from "./edge-ai";

type EdgeAiEnvelope = {
  success: boolean;
  data?: {
    reachable?: boolean;
    available?: boolean;
    stale?: boolean;
    offline?: boolean;
    partial?: boolean;
    snapshotStale?: boolean;
    state?: string;
    overallRiskLevel?: string;
    devices?: unknown[];
  };
};

type FakeHermesStore = {
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
};

type FakeHermesClient = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
};

function fakeHermesPool(store: FakeHermesStore) {
  let sequence = 1;
  const nextId = (): string => {
    const suffix = String(sequence++).padStart(12, "0");
    return `00000000-0000-4000-8000-${suffix}`;
  };
  const client: FakeHermesClient = {
    query(sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
      const normalized = sql.replace(/\s+/gu, " ").trim().toLowerCase();
      if (normalized.startsWith("select") && normalized.includes("from hermes_conversations") && normalized.includes("from hermes_messages")) {
        const owner = String(params[0]);
        const requestId = String(params[1]);
        const message = store.messages.find((item) =>
          item.role === "user" &&
          (item.metadata as Record<string, unknown> | undefined)?.requestId === requestId
        );
        const conversation = message
          ? store.conversations.find((item) =>
              item.conversation_id === message.conversation_id &&
              (item.user_id === owner ||
                (item.user_id === null && item.owner_username === owner))
            )
          : undefined;
        return Promise.resolve({ rows: conversation ? [conversation] : [] });
      }
      if (normalized.startsWith("insert into hermes_conversations")) {
        const row = {
          conversation_id: nextId(),
          user_id: params[0],
          owner_username: params[1],
          title: params[2],
          status: "active",
          created_at: "2026-08-06T00:00:00.000Z",
          updated_at: "2026-08-06T00:00:00.000Z",
        };
        store.conversations.push(row);
        return Promise.resolve({ rows: [row] });
      }
      if (normalized.startsWith("insert into hermes_messages")) {
        const row = {
          message_id: nextId(),
          conversation_id: params[0],
          role: params[1],
          content: params[2],
          metadata: JSON.parse(String(params[3])) as unknown,
          created_at: `2026-08-06T00:00:0${String(store.messages.length)}.000Z`,
        };
        store.messages.push(row);
        return Promise.resolve({ rows: [row] });
      }
      if (normalized.startsWith("select metadata") && normalized.includes("from hermes_messages")) {
        return Promise.resolve({ rows: [] });
      }
      if (normalized.startsWith("select role, content") && normalized.includes("from hermes_messages")) {
        return Promise.resolve({
          rows: store.messages
            .filter((item) => item.conversation_id === params[0] && (item.role === "user" || item.role === "assistant"))
            .map((item) => ({ role: item.role, content: item.content })),
        });
      }
      if (normalized.startsWith("insert into hermes_tasks")) {
        const row = {
          task_id: nextId(),
          conversation_id: params[0],
          action: params[4],
          label: params[5],
          status: "queued",
          safety_level: "read_only",
          result: {},
          edge_action_id: null,
          error: null,
          created_at: "2026-08-06T00:00:00.000Z",
          started_at: null,
          completed_at: null,
        };
        store.tasks.push(row);
        return Promise.resolve({ rows: [row] });
      }
      if (normalized.startsWith("update hermes_tasks set status='running'")) return Promise.resolve({ rows: [] });
      if (normalized.startsWith("update hermes_tasks") && normalized.includes("returning")) {
        const row = store.tasks.find((item) => item.task_id === params[0]);
        if (row) {
          row.status = params[1];
          row.result = JSON.parse(String(params[2]));
          row.edge_action_id = params[3];
          row.error = params[4];
          row.completed_at = "2026-08-06T00:00:01.000Z";
        }
        return Promise.resolve({ rows: row ? [row] : [] });
      }
      if (normalized.startsWith("select") && normalized.includes("from hermes_messages") && normalized.includes("order by created_at asc")) {
        return Promise.resolve({ rows: store.messages.filter((item) => item.conversation_id === params[0]) });
      }
      if (normalized.startsWith("select") && normalized.includes("from hermes_tasks") && normalized.includes("order by created_at asc")) {
        return Promise.resolve({ rows: store.tasks.filter((item) => item.conversation_id === params[0]) });
      }
      if (normalized.startsWith("update hermes_conversations")) {
        const row = store.conversations.find((item) => item.conversation_id === params[0]);
        return Promise.resolve({ rows: row ? [row] : [] });
      }
      return Promise.resolve({ rows: [] });
    },
    release(): void { return; },
  };
  return { connect: (): Promise<FakeHermesClient> => Promise.resolve(client) } as unknown as PgPool;
}

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
    const url = fetchUrl(input);
    await Promise.resolve();
    if (url.endsWith("/v1/supervision")) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    assert.equal(url, "http://127.0.0.1:18082/v1/edge-risk");
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
  assert.equal(data.stale, false);
  assert.equal(data.offline, false);
  assert.equal(data.state, "waiting_for_valid_node_data");
  assert.equal(data.overallRiskLevel, "unavailable");
  assert.deepEqual(data.devices, []);
  await app.close();
});

void test("status reports partial node availability instead of all nodes offline", async (context) => {
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = fetchUrl(input);
    await Promise.resolve();
    if (url.endsWith("/v1/supervision")) {
      return new Response(JSON.stringify({ generatedAt: new Date().toISOString() }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      available: true,
      generatedAt: new Date().toISOString(),
      overallRiskLevel: "normal",
      devices: [
        { deviceId: "node-b", dataStatus: "live" },
        { deviceId: "node-c", dataStatus: "live" },
        { deviceId: "node-a", dataStatus: "offline" },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
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
  const data = response.json<EdgeAiEnvelope>().data;
  assert.ok(data);
  assert.equal(data.reachable, true);
  assert.equal(data.available, true);
  assert.equal(data.partial, true);
  assert.equal(data.offline, false);
  assert.equal(data.state, "partial");
  assert.equal((data as unknown as Record<string, unknown>).liveDeviceCount, 2);
  assert.equal((data as unknown as Record<string, unknown>).offlineDeviceCount, 1);
  await app.close();
});

void test("status marks a fallback snapshot unreachable after the freshness window", async (context) => {
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = fetchUrl(input);
    await Promise.resolve();
    if (url.endsWith("/v1/supervision")) {
      return Promise.resolve(new Response(JSON.stringify({
        generatedAt: new Date(Date.now() - 180_000).toISOString(),
        edgeRiskAgent: {
          available: true,
          generatedAt: new Date(Date.now() - 180_000).toISOString(),
          devices: [{ deviceId: "node-b", dataStatus: "live" }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } }));
    }
    return new Response("unavailable", { status: 503 });
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
  const data = response.json<EdgeAiEnvelope>().data;
  assert.ok(data);
  assert.equal(data.reachable, false);
  assert.equal(data.available, false);
  assert.equal(data.stale, true);
  assert.equal(data.snapshotStale, true);
  assert.equal(data.state, "offline");
  await app.close();
});

void test("status marks a directly returned old risk snapshot as stale", async (context) => {
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = fetchUrl(input);
    await Promise.resolve();
    if (url.endsWith("/v1/supervision")) {
      return new Response(JSON.stringify({ generatedAt: new Date().toISOString() }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      available: true,
      generatedAt: new Date(Date.now() - 180_000).toISOString(),
      devices: [{ deviceId: "node-b", dataStatus: "live" }],
    }), { status: 200, headers: { "content-type": "application/json" } });
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
  const data = response.json<EdgeAiEnvelope>().data;
  assert.ok(data);
  assert.equal(data.reachable, false);
  assert.equal(data.available, false);
  assert.equal(data.snapshotStale, true);
  assert.equal(data.state, "offline");
  await app.close();
});

void test("status preserves nullable resources and OOD diagnosis evidence", async (context) => {
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = fetchUrl(input);
    await Promise.resolve();
    if (url.endsWith("/v1/supervision")) {
      return new Response(JSON.stringify({
        generatedAt: new Date().toISOString(),
        localResources: {
          load1: null,
          memTotalMb: 4096,
          memAvailableMb: null,
          memAvailableRatio: null,
          maxTemperatureC: null,
        },
        aiDiagnosis: {
          modelKey: "edge-diagnosis",
          modelVersion: "2026.08",
          modelType: "random_forest_classifier",
          modelLoaded: true,
          inferenceAt: new Date().toISOString(),
          inferenceDurationMs: 2.75,
          inputFeatureCount: 12,
          diagnosisType: "unknown_ood",
          confidence: 0.38,
          ood: {
            detected: true,
            normalizedEntropy: 0.91,
            minConfidence: 0.55,
            maxEntropy: 0.8,
            reason: "max_probability_below_threshold",
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      available: true,
      generatedAt: new Date().toISOString(),
      model: { loaded: true },
      inference: { lastInferenceDurationMs: 1.25, inputFeatureCount: 9 },
      devices: [{ deviceId: "node-b", dataStatus: "live" }],
    }), { status: 200, headers: { "content-type": "application/json" } });
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
  const data = response.json<{ data: Record<string, unknown> }>().data;
  const resources = testJsonObject(data.resources);
  assert.equal(resources.cpuLoad1, null);
  assert.equal(resources.memoryAvailableMb, null);
  assert.equal(resources.temperatureC, null);
  const diagnosis = testJsonObject(data.diagnosis);
  assert.equal(diagnosis.category, "unknown_ood");
  assert.equal(testJsonObject(diagnosis.ood).detected, true);
  const models = testJsonObject(data.models);
  const diagnosisModel = testJsonObject(models.diagnosis);
  assert.equal(diagnosisModel.inferenceDurationMs, 2.75);
  assert.equal(testJsonObject(diagnosisModel.ood).reason, "max_probability_below_threshold");
  await app.close();
});

void test("chat retries with the same requestId return history without dispatching twice", async (context) => {
  const store: FakeHermesStore = { conversations: [], messages: [], tasks: [] };
  let actionCalls = 0;
  context.mock.method(globalThis, "fetch", (input: string | URL | Request) => {
    const url = fetchUrl(input);
    if (url.endsWith("/v1/actions/generate_report")) {
      actionCalls += 1;
      return Promise.resolve(new Response(JSON.stringify({
        schema_version: 1,
        accepted: true,
        duplicate: false,
        action: {
          id: "00000000-0000-4000-8000-000000000301",
          status: "completed",
          summary: "报告已生成",
          result: { reportId: "report-1" },
        },
      }), { status: 200, headers: { "content-type": "application/json" } }));
    }
    return Promise.reject(new Error(`unexpected Hermes request: ${url}`));
  });

  const app = Fastify({ logger: false });
  app.decorateRequest("traceId", "edge-ai-test");
  app.decorateRequest("user", null);
  const config = loadConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123",
    AUTH_REQUIRED: "false",
    RK3568_HERMES_EDGE_SUPERVISOR_URL: "http://127.0.0.1:18082",
  });
  registerEdgeAiRoutes(app, config, fakeHermesPool(store));

  const payload = {
    message: "生成当前态势报告",
    requestId: "harmonyos:chat:retry-0001",
  };
  const first = await app.inject({ method: "POST", url: "/edge-ai/chat", payload });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json<{ data: { duplicate?: boolean } }>().data.duplicate, undefined);
  assert.equal(actionCalls, 1);

  const retry = await app.inject({ method: "POST", url: "/edge-ai/chat", payload });
  assert.equal(retry.statusCode, 200);
  const retryData = retry.json<{ data: { duplicate: boolean; requestId: string; tasks: unknown[] } }>().data;
  assert.equal(retryData.duplicate, true);
  assert.equal(retryData.requestId, payload.requestId);
  assert.equal(retryData.tasks.length, 1);
  assert.equal(actionCalls, 1);
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
