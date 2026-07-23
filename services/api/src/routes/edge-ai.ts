import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";
import { enqueueOperationLog } from "../operation-log";
import {
  buildHermesAssistantReply,
  HERMES_ACTION_LABELS,
  planHermesMessage,
  type HermesExecutedTask,
  type SafeHermesAction,
} from "../hermes-agent";

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

const chatSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    message: z.string().trim().min(1).max(2000),
  })
  .strict();

const conversationParamsSchema = z.object({ conversationId: z.string().uuid() });
const taskParamsSchema = z.object({ taskId: z.string().uuid() });
const conversationListSchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

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

export function resolveEdgeAiIntent(intent: string): EdgeAiIntentResolution {
  const plan = planHermesMessage(intent);
  const firstAction = plan.actions[0];
  const action = plan.actions.length === 1 && firstAction !== undefined ? firstAction : null;
  return {
    resolved: action !== null,
    blocked: plan.blocked,
    action,
    label: action ? HERMES_ACTION_LABELS[action] : null,
    reason:
      plan.actions.length > 1
        ? "请求包含多个安全任务，请使用 Hermes 对话接口按顺序自动执行"
        : plan.reason,
    suggestions: plan.actions.length > 1 ? plan.actions : plan.suggestions,
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

type HermesOwner = {
  userId: string | null;
  username: string;
};

type HermesConversationRow = {
  conversation_id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type HermesMessageRow = {
  message_id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: unknown;
  created_at: string;
};

type HermesTaskRow = {
  task_id: string;
  conversation_id: string;
  action: SafeHermesAction;
  label: string;
  status: string;
  safety_level: string;
  result: unknown;
  edge_action_id: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

function ownerForRequest(request: {
  user: { userId: string; username: string } | null;
}): HermesOwner {
  return {
    userId: request.user?.userId ?? null,
    username: request.user?.username ?? "admin",
  };
}

function conversationDto(row: HermesConversationRow): JsonObject {
  return {
    conversationId: row.conversation_id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function messageDto(row: HermesMessageRow): JsonObject {
  return {
    messageId: row.message_id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    metadata: isObject(row.metadata) ? row.metadata : {},
    createdAt: row.created_at,
  };
}

function taskResult(value: unknown): JsonObject {
  if (!isObject(value)) return {};
  const edgeAction = isObject(value.action) ? value.action : null;
  return edgeAction && isObject(edgeAction.result) ? edgeAction.result : value;
}

function taskSummary(value: unknown): string {
  if (!isObject(value) || !isObject(value.action)) return "";
  const summary = value.action.summary;
  return typeof summary === "string" ? summary : "";
}

function taskDto(row: HermesTaskRow): JsonObject {
  return {
    taskId: row.task_id,
    conversationId: row.conversation_id,
    action: row.action,
    label: row.label,
    status: row.status,
    safetyLevel: row.safety_level,
    summary: taskSummary(row.result),
    result: taskResult(row.result),
    edgeActionId: row.edge_action_id,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

const CONVERSATION_COLUMNS = `
  conversation_id,
  title,
  status,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
`;

const MESSAGE_COLUMNS = `
  message_id,
  conversation_id,
  role,
  content,
  metadata,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
`;

const TASK_COLUMNS = `
  task_id,
  conversation_id,
  action,
  label,
  status,
  safety_level,
  result,
  edge_action_id,
  error,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  CASE WHEN started_at IS NULL THEN NULL ELSE to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS started_at,
  CASE WHEN completed_at IS NULL THEN NULL ELSE to_char(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS completed_at
`;

async function loadOwnedConversation(
  pg: PgPool,
  conversationId: string,
  owner: HermesOwner
): Promise<HermesConversationRow | null> {
  return withPgClient(pg, async (client) =>
    queryOne<HermesConversationRow>(
      client,
      owner.userId
        ? `SELECT ${CONVERSATION_COLUMNS} FROM hermes_conversations WHERE conversation_id=$1 AND user_id=$2`
        : `SELECT ${CONVERSATION_COLUMNS} FROM hermes_conversations WHERE conversation_id=$1 AND user_id IS NULL AND owner_username=$2`,
      [conversationId, owner.userId ?? owner.username]
    )
  );
}

async function createConversation(
  pg: PgPool,
  owner: HermesOwner,
  message: string
): Promise<HermesConversationRow> {
  return withPgClient(pg, async (client) => {
    const title = message.replace(/\s+/gu, " ").slice(0, 28);
    const row = await queryOne<HermesConversationRow>(
      client,
      `
        INSERT INTO hermes_conversations(user_id, owner_username, title)
        VALUES ($1, $2, $3)
        RETURNING ${CONVERSATION_COLUMNS}
      `,
      [owner.userId, owner.username, title || "新的研判任务"]
    );
    if (!row) throw new Error("Hermes 会话创建失败");
    return row;
  });
}

async function insertMessage(
  pg: PgPool,
  conversationId: string,
  role: HermesMessageRow["role"],
  content: string,
  metadata: JsonObject = {}
): Promise<HermesMessageRow> {
  return withPgClient(pg, async (client) => {
    const row = await queryOne<HermesMessageRow>(
      client,
      `
        INSERT INTO hermes_messages(conversation_id, role, content, metadata)
        VALUES ($1, $2, $3, $4::jsonb)
        RETURNING ${MESSAGE_COLUMNS}
      `,
      [conversationId, role, content, JSON.stringify(metadata)]
    );
    if (!row) throw new Error("Hermes 消息保存失败");
    return row;
  });
}

async function createTask(
  pg: PgPool,
  conversationId: string,
  messageId: string,
  owner: HermesOwner,
  action: SafeHermesAction,
  message: string
): Promise<HermesTaskRow> {
  return withPgClient(pg, async (client) => {
    const row = await queryOne<HermesTaskRow>(
      client,
      `
        INSERT INTO hermes_tasks(
          conversation_id, request_message_id, requested_by, requested_by_username,
          action, label, status, safety_level, request
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'queued', 'read_only', $7::jsonb)
        RETURNING ${TASK_COLUMNS}
      `,
      [
        conversationId,
        messageId,
        owner.userId,
        owner.username,
        action,
        HERMES_ACTION_LABELS[action],
        JSON.stringify({ message }),
      ]
    );
    if (!row) throw new Error("Hermes 任务创建失败");
    return row;
  });
}

async function markTaskRunning(pg: PgPool, taskId: string): Promise<void> {
  await withPgClient(pg, async (client) => {
    await client.query(
      `UPDATE hermes_tasks SET status='running', started_at=NOW() WHERE task_id=$1 AND status='queued'`,
      [taskId]
    );
  });
}

async function finishTask(
  pg: PgPool,
  taskId: string,
  result: ReturnType<typeof callHermes> extends Promise<infer T> ? T : never
): Promise<HermesTaskRow> {
  return withPgClient(pg, async (client) => {
    const edgeAction = isObject(result.body.action) ? result.body.action : null;
    const edgeActionId = edgeAction && typeof edgeAction.id === "string" ? edgeAction.id : null;
    const row = await queryOne<HermesTaskRow>(
      client,
      `
        UPDATE hermes_tasks
        SET status=$2, result=$3::jsonb, edge_action_id=$4, error=$5, completed_at=NOW()
        WHERE task_id=$1
        RETURNING ${TASK_COLUMNS}
      `,
      [
        taskId,
        result.ok ? "succeeded" : "failed",
        JSON.stringify(result.body),
        edgeActionId,
        result.error,
      ]
    );
    if (!row) throw new Error("Hermes 任务状态更新失败");
    return row;
  });
}

async function loadPreviousPlan(pg: PgPool, conversationId: string): Promise<SafeHermesAction[]> {
  const row = await withPgClient(pg, async (client) =>
    queryOne<{ metadata: unknown }>(
      client,
      `
        SELECT metadata
        FROM hermes_messages
        WHERE conversation_id=$1 AND role='assistant'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [conversationId]
    )
  );
  if (!isObject(row?.metadata) || !Array.isArray(row.metadata.plan)) return [];
  const actions: SafeHermesAction[] = [];
  for (const value of row.metadata.plan) {
    if (value === "recheck") actions.push("recheck");
    else if (value === "collect_logs") actions.push("collect_logs");
    else if (value === "generate_report") actions.push("generate_report");
  }
  return actions;
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

  app.get("/edge-ai/conversations", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      fail(reply, 503, "Hermes 会话存储暂不可用", traceId);
      return;
    }
    const parsed = conversationListSchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parsed.error.issues });
      return;
    }
    const owner = ownerForRequest(request);
    const rows = await withPgClient(pg, async (client) => {
      const result = await client.query<HermesConversationRow>(
        owner.userId
          ? `SELECT ${CONVERSATION_COLUMNS} FROM hermes_conversations WHERE user_id=$1 AND status='active' ORDER BY updated_at DESC LIMIT $2`
          : `SELECT ${CONVERSATION_COLUMNS} FROM hermes_conversations WHERE user_id IS NULL AND owner_username=$1 AND status='active' ORDER BY updated_at DESC LIMIT $2`,
        [owner.userId ?? owner.username, parsed.data.pageSize]
      );
      return result.rows;
    });
    ok(reply, { conversations: rows.map(conversationDto) }, traceId);
  });

  app.get("/edge-ai/conversations/:conversationId/messages", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      fail(reply, 503, "Hermes 会话存储暂不可用", traceId);
      return;
    }
    const parsed = conversationParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      fail(reply, 400, "conversationId 无效", traceId);
      return;
    }
    const conversation = await loadOwnedConversation(
      pg,
      parsed.data.conversationId,
      ownerForRequest(request)
    );
    if (!conversation) {
      fail(reply, 404, "Hermes 会话不存在", traceId);
      return;
    }
    const history = await withPgClient(pg, async (client) => {
      const [messages, tasks] = await Promise.all([
        client.query<HermesMessageRow>(
          `SELECT ${MESSAGE_COLUMNS} FROM hermes_messages WHERE conversation_id=$1 ORDER BY created_at ASC LIMIT 200`,
          [conversation.conversation_id]
        ),
        client.query<HermesTaskRow>(
          `SELECT ${TASK_COLUMNS} FROM hermes_tasks WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 100`,
          [conversation.conversation_id]
        ),
      ]);
      return { messages: messages.rows, tasks: tasks.rows };
    });
    ok(
      reply,
      {
        conversation: conversationDto(conversation),
        messages: history.messages.map(messageDto),
        tasks: history.tasks.map(taskDto),
      },
      traceId
    );
  });

  app.get("/edge-ai/tasks/:taskId", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      fail(reply, 503, "Hermes 任务存储暂不可用", traceId);
      return;
    }
    const parsed = taskParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      fail(reply, 400, "taskId 无效", traceId);
      return;
    }
    const owner = ownerForRequest(request);
    const row = await withPgClient(pg, async (client) =>
      queryOne<HermesTaskRow>(
        client,
        owner.userId
          ? `SELECT ${TASK_COLUMNS} FROM hermes_tasks WHERE task_id=$1 AND conversation_id IN (SELECT conversation_id FROM hermes_conversations WHERE user_id=$2)`
          : `SELECT ${TASK_COLUMNS} FROM hermes_tasks WHERE task_id=$1 AND conversation_id IN (SELECT conversation_id FROM hermes_conversations WHERE user_id IS NULL AND owner_username=$2)`,
        [parsed.data.taskId, owner.userId ?? owner.username]
      )
    );
    if (!row) {
      fail(reply, 404, "Hermes 任务不存在", traceId);
      return;
    }
    ok(reply, taskDto(row), traceId);
  });

  app.post("/edge-ai/chat", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;
    if (!pg) {
      fail(reply, 503, "Hermes 会话存储暂不可用", traceId);
      return;
    }
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parsed.error.issues });
      return;
    }

    const owner = ownerForRequest(request);
    let conversation = parsed.data.conversationId
      ? await loadOwnedConversation(pg, parsed.data.conversationId, owner)
      : null;
    if (parsed.data.conversationId && !conversation) {
      fail(reply, 404, "Hermes 会话不存在", traceId);
      return;
    }
    conversation ??= await createConversation(pg, owner, parsed.data.message);
    const userMessage = await insertMessage(
      pg,
      conversation.conversation_id,
      "user",
      parsed.data.message
    );
    const previousPlan = await loadPreviousPlan(pg, conversation.conversation_id);
    const plan = planHermesMessage(parsed.data.message, previousPlan);
    const completedRows: HermesTaskRow[] = [];
    const executedTasks: HermesExecutedTask[] = [];

    for (const action of plan.actions) {
      const task = await createTask(
        pg,
        conversation.conversation_id,
        userMessage.message_id,
        owner,
        action,
        parsed.data.message
      );
      await markTaskRunning(pg, task.task_id);
      const result = await callHermes(config, `/v1/actions/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestedBy: owner.username,
          intent: parsed.data.message,
          conversationId: conversation.conversation_id,
          taskId: task.task_id,
        }),
      });
      const completed = await finishTask(pg, task.task_id, result);
      completedRows.push(completed);
      executedTasks.push({
        action,
        label: HERMES_ACTION_LABELS[action],
        status: result.ok ? "succeeded" : "failed",
        summary:
          taskSummary(result.body) ||
          `${HERMES_ACTION_LABELS[action]}${result.ok ? "完成" : "失败"}`,
        result: taskResult(result.body),
        error: result.error,
      });
    }

    const assistantContent = buildHermesAssistantReply(plan, executedTasks);
    const assistantMessage = await insertMessage(
      pg,
      conversation.conversation_id,
      "assistant",
      assistantContent,
      {
        blocked: plan.blocked,
        plan: plan.actions,
        taskIds: completedRows.map((task) => task.task_id),
        safetyBoundary: "read_only_or_sidecar_only",
      }
    );
    conversation = await withPgClient(pg, async (client) => {
      const row = await queryOne<HermesConversationRow>(
        client,
        `UPDATE hermes_conversations SET updated_at=NOW() WHERE conversation_id=$1 RETURNING ${CONVERSATION_COLUMNS}`,
        [conversation?.conversation_id]
      );
      if (!row) throw new Error("Hermes 会话更新时间失败");
      return row;
    });

    void enqueueOperationLog(pg, request, {
      module: "edge_ai",
      action: "hermes_chat_dispatch",
      description: "Hermes conversation planned and dispatched bounded edge tasks",
      status: executedTasks.some((task) => task.status === "failed") ? "fail" : "success",
      targetType: "hermes_conversation",
      targetId: conversation.conversation_id,
      requestData: { message: parsed.data.message, plan },
      responseData: { taskIds: completedRows.map((task) => task.task_id), blocked: plan.blocked },
    });

    ok(
      reply,
      {
        conversation: conversationDto(conversation),
        messages: [messageDto(userMessage), messageDto(assistantMessage)],
        tasks: completedRows.map(taskDto),
        blocked: plan.blocked,
        suggestions: plan.suggestions,
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
