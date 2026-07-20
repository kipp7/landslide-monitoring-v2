import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { enqueueOperationLog } from "../operation-log";

const actionSchema = z
  .object({
    action: z.enum(["recheck", "collect_logs", "generate_report"]),
    intent: z.string().max(500).optional(),
  })
  .strict();

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hermesBaseUrl(config: AppConfig): string | null {
  const configured = config.rk3568HermesEdgeSupervisorUrl?.trim();
  if (!configured) return null;
  return configured.replace(/\/+$/, "").replace(/\/v1\/supervision$/, "");
}

async function callHermes(
  config: AppConfig,
  path: string,
  init?: RequestInit
): Promise<{
  ok: boolean;
  status: number;
  body: JsonObject;
  error: string | null;
}> {
  const baseUrl = hermesBaseUrl(config);
  if (!baseUrl)
    return { ok: false, status: 0, body: {}, error: "RK3568_HERMES_EDGE_SUPERVISOR_URL 未配置" };
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, config.rk3568StatusHttpTimeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...(init ?? {}),
      signal: controller.signal,
    });
    const parsed: unknown = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      body: isObject(parsed) ? parsed : {},
      error: response.ok ? null : `Hermes HTTP ${String(response.status)}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: {},
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function registerEdgeAiRoutes(
  app: FastifyInstance,
  config: AppConfig,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = {
    adminApiToken: config.adminApiToken,
    jwtEnabled: Boolean(config.jwtAccessSecret),
  };

  app.get("/edge-ai/status", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;

    const direct = await callHermes(config, "/v1/edge-risk", { method: "GET" });
    if (direct.ok) {
      ok(reply, { ...direct.body, available: direct.body.available === true }, traceId);
      return;
    }

    const supervision =
      direct.status > 0
        ? await callHermes(config, "/v1/supervision", { method: "GET" })
        : { ok: false, status: 0, body: {}, error: direct.error };
    const edgeRiskAgent = isObject(supervision.body.edgeRiskAgent)
      ? supervision.body.edgeRiskAgent
      : null;
    if (supervision.ok && edgeRiskAgent) {
      ok(reply, { ...edgeRiskAgent, available: edgeRiskAgent.available === true }, traceId);
      return;
    }

    ok(
      reply,
      {
        available: false,
        mode: "hermes-edge-risk-agent",
        generatedAt: new Date().toISOString(),
        mqttConnected: false,
        overallRiskLevel: "unavailable",
        maxRiskScore: null,
        hardRuleTriggered: false,
        devices: [],
        tasks: [],
        pendingUploadCount: 0,
        model: {
          loaded: false,
          modelKey: null,
          modelVersion: null,
          trainedAt: null,
          trainingSource: null,
          error: direct.error ?? supervision.error ?? "Hermes 暂不可达",
        },
      },
      traceId
    );
  });

  app.post("/edge-ai/actions", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;
    const parsed = actionSchema.safeParse(request.body);
    if (!parsed.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parsed.error.issues });
      return;
    }
    const result = await callHermes(config, `/v1/actions/${parsed.data.action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestedBy: "api-user",
        intent: parsed.data.intent ?? null,
      }),
    });
    void enqueueOperationLog(pg, request, {
      module: "edge_ai",
      action: parsed.data.action,
      description: "Hermes safe edge AI action",
      status: result.ok ? "success" : "fail",
      requestData: parsed.data,
      responseData: result.body,
    });
    if (!result.ok) {
      fail(
        reply,
        result.status > 0 ? result.status : 503,
        result.error ?? "Hermes 动作失败",
        traceId
      );
      return;
    }
    ok(reply, result.body, traceId);
  });
}
