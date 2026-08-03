import { z } from "zod";
import type { AppConfig } from "./config";
import {
  HERMES_SAFE_ACTIONS,
  planHermesMessage,
  type HermesTaskPlan,
  type SafeHermesAction,
} from "./hermes-agent";

export type HermesPlannerSource = "model" | "deterministic";

export type HermesPlannerFallbackReason =
  | "not_configured"
  | "timeout"
  | "network_error"
  | "http_error"
  | "invalid_response"
  | "circuit_open";

export type HermesPlannerMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HermesPlanningResult = {
  plan: HermesTaskPlan;
  source: HermesPlannerSource;
  model: string | null;
  fallbackReason: HermesPlannerFallbackReason | null;
};

const safeActionSchema = z.enum(HERMES_SAFE_ACTIONS);
const uniqueActions = (actions: readonly SafeHermesAction[]): boolean =>
  new Set(actions).size === actions.length;

const modelPlanSchema = z
  .object({
    blocked: z.boolean(),
    reason: z.string().trim().min(1).max(800),
    actions: z.array(safeActionSchema).max(HERMES_SAFE_ACTIONS.length),
    suggestions: z.array(safeActionSchema).max(HERMES_SAFE_ACTIONS.length),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.blocked && value.actions.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actions"],
        message: "blocked plans cannot contain executable actions",
      });
    }
    if (!uniqueActions(value.actions)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actions"],
        message: "actions must be unique",
      });
    }
    if (!uniqueActions(value.suggestions)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["suggestions"],
        message: "suggestions must be unique",
      });
    }
  });

const MODEL_PLAN_JSON_SCHEMA = {
  name: "hermes_safe_task_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      blocked: { type: "boolean" },
      reason: { type: "string", minLength: 1, maxLength: 800 },
      actions: {
        type: "array",
        maxItems: HERMES_SAFE_ACTIONS.length,
        uniqueItems: true,
        items: { type: "string", enum: [...HERMES_SAFE_ACTIONS] },
      },
      suggestions: {
        type: "array",
        maxItems: HERMES_SAFE_ACTIONS.length,
        uniqueItems: true,
        items: { type: "string", enum: [...HERMES_SAFE_ACTIONS] },
      },
    },
    required: ["blocked", "reason", "actions", "suggestions"],
  },
} as const;

const HERMES_PLANNER_SYSTEM_PROMPT = `你是山体滑坡监测系统的 Hermes 任务规划器。
你只负责理解中文对话并输出结构化计划，不执行任务，不声称已经操作设备。
自动执行白名单只有：
- recheck：重新研判当前监测数据和风险
- collect_logs：采集只读诊断证据并诊断链路
- generate_report：根据现有证据生成态势报告

必须遵守：
1. actions 只能使用上述三个值，按用户要求的执行顺序排列且不得重复。
2. 重启、关机、切换网络、修改阈值、触发或解除告警、控制设备、写串口、删除数据等请求必须 blocked=true 且 actions=[]。
3. 不得把 Shell、串口、MQTT、物理告警或设备控制包装成白名单动作。
4. 没有足够信息时不要猜测现场状态；可以自然回答、提出澄清，或给出白名单 suggestions。
5. reason 使用简洁自然的中文。不要输出 Markdown，不要输出 JSON 以外的内容。`;

const modelCooldownUntil = new Map<string, number>();

type OpenAiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function completionsUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/u, "");
  return normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
}

function modelKey(config: AppConfig): string {
  return `${config.hermesLlmBaseUrl ?? ""}\n${config.hermesLlmModel ?? ""}`;
}

function boundedHistory(history: readonly HermesPlannerMessage[]): OpenAiMessage[] {
  const selected: HermesPlannerMessage[] = [];
  let remainingCharacters = 12_000;
  for (let index = history.length - 1; index >= 0 && selected.length < 12; index -= 1) {
    const entry = history[index];
    if (!entry || remainingCharacters <= 0) break;
    const content = entry.content.trim().slice(0, Math.min(2_500, remainingCharacters));
    if (!content) continue;
    selected.push({ role: entry.role, content });
    remainingCharacters -= content.length;
  }
  return selected.reverse();
}

function responseContent(value: unknown): string | null {
  if (!isObject(value) || !Array.isArray(value.choices)) return null;
  const choices: unknown[] = value.choices;
  const first: unknown = choices[0];
  if (!isObject(first) || !isObject(first.message)) return null;
  return typeof first.message.content === "string" ? first.message.content : null;
}

function transientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function requestModelPlan(
  config: AppConfig,
  history: readonly HermesPlannerMessage[]
): Promise<
  | { ok: true; plan: HermesTaskPlan }
  | { ok: false; reason: Exclude<HermesPlannerFallbackReason, "not_configured">; retryable: boolean }
> {
  const baseUrl = config.hermesLlmBaseUrl;
  const model = config.hermesLlmModel;
  if (!baseUrl || !model) {
    return { ok: false, reason: "invalid_response", retryable: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, config.hermesLlmTimeoutMs);
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (config.hermesLlmApiKey) headers.authorization = `Bearer ${config.hermesLlmApiKey}`;
    const messages: OpenAiMessage[] = [
      { role: "system", content: HERMES_PLANNER_SYSTEM_PROMPT },
      ...boundedHistory(history),
    ];
    const response = await fetch(completionsUrl(baseUrl), {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        messages,
        response_format: { type: "json_schema", json_schema: MODEL_PLAN_JSON_SCHEMA },
      }),
    });
    if (!response.ok) {
      return { ok: false, reason: "http_error", retryable: transientStatus(response.status) };
    }
    const payload: unknown = await response.json().catch(() => null);
    const content = responseContent(payload);
    if (!content) return { ok: false, reason: "invalid_response", retryable: false };
    const json: unknown = JSON.parse(content);
    const parsed = modelPlanSchema.safeParse(json);
    if (!parsed.success) {
      return { ok: false, reason: "invalid_response", retryable: false };
    }
    return { ok: true, plan: parsed.data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: "timeout", retryable: true };
    }
    if (error instanceof SyntaxError) {
      return { ok: false, reason: "invalid_response", retryable: false };
    }
    return { ok: false, reason: "network_error", retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

export async function planHermesWithFallback(
  config: AppConfig,
  message: string,
  previousActions: readonly SafeHermesAction[] = [],
  history: readonly HermesPlannerMessage[] = []
): Promise<HermesPlanningResult> {
  const deterministicPlan = planHermesMessage(message, previousActions);

  // The deterministic guard runs before any model call and remains authoritative.
  if (deterministicPlan.blocked || config.hermesPlannerMode === "deterministic") {
    return {
      plan: deterministicPlan,
      source: "deterministic",
      model: null,
      fallbackReason: null,
    };
  }

  if (!config.hermesLlmBaseUrl || !config.hermesLlmModel) {
    return {
      plan: deterministicPlan,
      source: "deterministic",
      model: null,
      fallbackReason: "not_configured",
    };
  }

  const cooldownKey = modelKey(config);
  const cooldownUntil = modelCooldownUntil.get(cooldownKey) ?? 0;
  if (cooldownUntil > Date.now()) {
    return {
      plan: deterministicPlan,
      source: "deterministic",
      model: null,
      fallbackReason: "circuit_open",
    };
  }
  modelCooldownUntil.delete(cooldownKey);

  let fallbackReason: Exclude<HermesPlannerFallbackReason, "not_configured"> = "invalid_response";
  for (let attempt = 0; attempt < config.hermesLlmMaxAttempts; attempt += 1) {
    const result = await requestModelPlan(config, history);
    if (result.ok) {
      modelCooldownUntil.delete(cooldownKey);
      return {
        plan: result.plan,
        source: "model",
        model: config.hermesLlmModel,
        fallbackReason: null,
      };
    }
    fallbackReason = result.reason;
    if (!result.retryable) break;
  }

  modelCooldownUntil.set(cooldownKey, Date.now() + config.hermesLlmCooldownMs);

  return {
    plan: deterministicPlan,
    source: "deterministic",
    model: null,
    fallbackReason,
  };
}
