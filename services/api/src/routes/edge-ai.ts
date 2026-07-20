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

const intentSchema = z
  .object({
    intent: z.string().trim().min(1).max(500),
  })
  .strict();

type SafeHermesAction = z.infer<typeof actionSchema>["action"];

export type EdgeAiIntentResolution = {
  resolved: boolean;
  blocked: boolean;
  action: SafeHermesAction | null;
  label: string | null;
  reason: string;
  suggestions: SafeHermesAction[];
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ACTION_LABELS: Record<SafeHermesAction, string> = {
  recheck: "重新研判",
  collect_logs: "诊断链路",
  generate_report: "生成报告",
};

const PROTECTED_INTENT_TERMS = [
  "重启",
  "关闭服务",
  "停止服务",
  "切换网络",
  "切换wifi",
  "修改阈值",
  "调整阈值",
  "触发告警",
  "解除告警",
  "控制设备",
  "写串口",
] as const;

const INTENT_TERMS: Record<SafeHermesAction, readonly string[]> = {
  recheck: [
    "重新研判",
    "重新检查",
    "复检",
    "检查风险",
    "为什么危险",
    "为什么预警",
    "节点状态",
    "风险状态",
    "倾角",
    "gps",
    "湿度",
    "电导率",
  ],
  collect_logs: [
    "收集日志",
    "日志诊断",
    "诊断链路",
    "检查链路",
    "通信故障",
    "上传异常",
    "mqtt",
    "串口日志",
    "故障证据",
  ],
  generate_report: [
    "生成报告",
    "生成简报",
    "态势报告",
    "态势简报",
    "处置报告",
    "汇报材料",
    "总结当前",
  ],
};

function normalizedIntent(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, "");
}

export function resolveEdgeAiIntent(intent: string): EdgeAiIntentResolution {
  const normalized = normalizedIntent(intent);
  if (PROTECTED_INTENT_TERMS.some((term) => normalized.includes(term))) {
    return {
      resolved: false,
      blocked: true,
      action: null,
      label: null,
      reason: "请求涉及受保护的设备或告警控制，必须由人工在专用页面确认",
      suggestions: ["recheck", "generate_report"],
    };
  }

  const matches = (Object.keys(INTENT_TERMS) as SafeHermesAction[])
    .map((action) => ({
      action,
      terms: INTENT_TERMS[action].filter((term) => normalized.includes(term)),
    }))
    .filter((entry) => entry.terms.length > 0)
    .sort((left, right) => {
      const countDelta = right.terms.length - left.terms.length;
      if (countDelta !== 0) return countDelta;
      const rightLength = Math.max(...right.terms.map((term) => term.length));
      const leftLength = Math.max(...left.terms.map((term) => term.length));
      return rightLength - leftLength;
    });
  const first = matches[0];
  const second = matches[1];
  if (!first) {
    return {
      resolved: false,
      blocked: false,
      action: null,
      label: null,
      reason: "没有识别到可安全执行的任务，请选择建议动作",
      suggestions: ["recheck", "generate_report", "collect_logs"],
    };
  }
  if (second?.terms.length === first.terms.length) {
    return {
      resolved: false,
      blocked: false,
      action: null,
      label: null,
      reason: "请求同时包含多个任务，请先选择本次要执行的动作",
      suggestions: [first.action, second.action],
    };
  }
  return {
    resolved: true,
    blocked: false,
    action: first.action,
    label: ACTION_LABELS[first.action],
    reason: `识别到“${first.terms.join("、")}”，将执行${ACTION_LABELS[first.action]}`,
    suggestions: [],
  };
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

  app.get("/edge-ai/actions", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    const result = await callHermes(config, "/v1/actions", { method: "GET" });
    if (!result.ok) {
      fail(
        reply,
        result.status > 0 ? result.status : 503,
        result.error ?? "Hermes 任务历史暂不可用",
        traceId
      );
      return;
    }
    ok(reply, result.body, traceId);
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

  app.post("/edge-ai/intents", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;
    const parsed = intentSchema.safeParse(request.body);
    if (!parsed.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parsed.error.issues });
      return;
    }
    const resolution = resolveEdgeAiIntent(parsed.data.intent);
    if (!resolution.resolved || !resolution.action) {
      ok(reply, { intent: parsed.data.intent, resolution, execution: null }, traceId);
      return;
    }
    const result = await callHermes(config, `/v1/actions/${resolution.action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestedBy: "api-user",
        intent: parsed.data.intent,
      }),
    });
    void enqueueOperationLog(pg, request, {
      module: "edge_ai",
      action: resolution.action,
      description: "Hermes resolved safe natural-language intent",
      status: result.ok ? "success" : "fail",
      requestData: { intent: parsed.data.intent, resolution },
      responseData: result.body,
    });
    if (!result.ok) {
      fail(
        reply,
        result.status > 0 ? result.status : 503,
        result.error ?? "Hermes 意图执行失败",
        traceId
      );
      return;
    }
    ok(reply, { intent: parsed.data.intent, resolution, execution: result.body }, traceId);
  });
}
