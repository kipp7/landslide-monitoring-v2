import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import dotenv from "dotenv";
import type { EdgeTelemetrySnapshot } from "@lsmv2/edge-risk-model";
import { createLogger } from "@lsmv2/observability";
import { loadConfigFromEnv, type AppConfig } from "./config";
import { EdgeRiskAgent, type EdgeRiskAgentStatus } from "./edge-risk-agent";

type JsonObject = Record<string, unknown>;
type Level = "healthy" | "attention" | "degraded" | "critical";

type HermesTask = {
  key: string;
  title: string;
  severity: Level;
  status: string;
  trigger: string;
  safeToAutomate: boolean;
  automationScope: string;
  evidence: JsonObject;
  operatorAction: string;
};

type LocalResourceSnapshot = {
  load1: number | null;
  memTotalMb: number | null;
  memAvailableMb: number | null;
  memAvailableRatio: number | null;
  diskTotalMb: number | null;
  diskFreeMb: number | null;
  diskFreeRatio: number | null;
  maxTemperatureC: number | null;
  error: string | null;
};

type HermesAction = {
  id: string;
  createdAt: string;
  action: "recheck" | "collect_logs" | "generate_report";
  status: "accepted" | "completed" | "rejected";
  requestedBy: string;
  naturalLanguageIntent: string | null;
  summary: string;
  result: JsonObject;
};

type DiagnosticCommandResult = {
  command: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
};

type AiModelStatus = {
  modelKey: string;
  task: "edge_link_diagnosis";
  status: "loaded" | "unavailable";
  modelType: "random_forest_classifier";
  modelVersion: string;
  featureCount: number;
  output: AiDiagnosis;
};

type SupervisionReport = {
  schema_version: 1;
  generatedAt: string;
  service: string;
  mode: "hermes-edge-supervisor";
  accepted: boolean;
  currentBoundary: "hermes-edge-supervisor-ready" | "hermes-edge-supervisor-needs-review";
  source: {
    automationUrl: string;
    summaryUrl: string;
    fetchedAt: string | null;
    automationGeneratedAt: string | null;
    summaryGeneratedAt: string | null;
    automationAgeSeconds: number | null;
    summaryAgeSeconds: number | null;
    automationError: string | null;
    summaryError: string | null;
  };
  localResources: LocalResourceSnapshot;
  summary: {
    overallLevel: Level;
    taskCount: number;
    blockedCount: number;
    recommendedCount: number;
    clearCount: number;
    safeAutomatableCount: number;
  };
  hermesPlan: {
    nextTasks: HermesTask[];
    executionPolicy: "advisory_first";
    protectedCore: {
      gatewayCore: true;
      serialIngest: true;
      mqttUplink: true;
    };
  };
  aiDiagnosis: AiDiagnosis;
  aiModels: AiModelStatus[];
  edgeRiskAgent: EdgeRiskAgentStatus;
  actionInterface: {
    mode: "safe_intent_router";
    endpoints: string[];
    supportedActions: HermesAction["action"][];
    safetyBoundary: "read_only_or_sidecar_only";
    naturalLanguageReady: boolean;
  };
};

type AiDiagnosis = {
  modelKey: string;
  modelVersion: string;
  modelType: "random_forest_classifier";
  diagnosisType: string;
  confidence: number;
  confidenceLevel: "low" | "medium" | "high";
  summary: string;
  featureVector: Record<string, number>;
  classProbabilities: Record<string, number>;
  recommendedPlan: string[];
  modelLoaded: boolean;
  modelError: string | null;
};

type RandomForestTree = {
  childrenLeft: number[];
  childrenRight: number[];
  feature: number[];
  threshold: number[];
  value: number[][];
};

type DiagnosisModelArtifact = {
  schemaVersion: "hermes-edge-diagnosis-random-forest.v1";
  modelKey: string;
  modelVersion: string;
  modelType: "random_forest_classifier";
  featureKeys: string[];
  classLabels: string[];
  forest: {
    trees: RandomForestTree[];
  };
};

function isoNow(): string {
  return new Date().toISOString();
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown, key: string): string | null {
  if (!isObject(value)) return null;
  const next = value[key];
  return typeof next === "string" && next.trim().length > 0 ? next : null;
}

function ageSeconds(isoTs: string | null): number | null {
  if (!isoTs) return null;
  const ts = Date.parse(isoTs);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, Math.round((Date.now() - ts) / 1000));
}

function levelRank(level: Level): number {
  switch (level) {
    case "healthy":
      return 0;
    case "attention":
      return 1;
    case "degraded":
      return 2;
    case "critical":
      return 3;
  }
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJsonAtomic(targetPath: string, value: unknown): Promise<void> {
  const resolved = path.resolve(targetPath);
  await ensureDir(path.dirname(resolved));
  const tempPath = `${resolved}.${String(process.pid)}.${String(Date.now())}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, resolved);
}

async function fetchJson(
  url: string
): Promise<{ document: JsonObject | null; error: string | null }> {
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      return { document: null, error: `http ${response.status}` };
    }
    const parsed: unknown = await response.json();
    if (!isObject(parsed)) {
      return { document: null, error: "json root is not an object" };
    }
    return { document: parsed, error: null };
  } catch (error) {
    return { document: null, error: error instanceof Error ? error.message : String(error) };
  }
}

class HermesEdgeSupervisor {
  private readonly logger: ReturnType<typeof createLogger>;
  private readonly edgeRiskAgent: EdgeRiskAgent;
  private refreshTimer: NodeJS.Timeout | null = null;
  private server: http.Server | null = null;
  private latestReport: SupervisionReport | null = null;
  private diagnosisModel: DiagnosisModelArtifact | null = null;
  private diagnosisModelError: string | null = null;
  private readonly recentActions: HermesAction[] = [];

  constructor(private readonly config: AppConfig) {
    this.logger = createLogger(config.serviceName);
    this.edgeRiskAgent = new EdgeRiskAgent(config);
  }

  async start(): Promise<void> {
    await this.loadDiagnosisModel();
    await this.loadRecentActions();
    try {
      await this.edgeRiskAgent.start();
    } catch (error) {
      this.logger.warn(
        { err: error },
        "optional edge risk agent failed to start; core supervision remains available"
      );
    }
    await this.refresh();
    this.refreshTimer = setInterval(() => {
      void this.refresh();
    }, this.config.pollIntervalMs);

    this.server = http.createServer((request, response) => {
      this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      const server = this.server;
      if (!server) {
        reject(new Error("http server not initialized"));
        return;
      }

      server.once("error", reject);
      server.listen(this.config.httpPort, this.config.httpHost, () => {
        server.off("error", reject);
        resolve();
      });
    });

    this.logger.info(
      {
        automationUrl: this.config.automationUrl,
        diagnosisModelPath: this.config.diagnosisModelPath,
        diagnosisModelLoaded: this.diagnosisModel !== null,
        diagnosisModelError: this.diagnosisModelError,
        supervisionFilePath: this.config.supervisionFilePath,
        httpHost: this.config.httpHost,
        httpPort: this.config.httpPort,
      },
      "hermes edge supervisor started"
    );
  }

  async stop(signal: string): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server?.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      this.server = null;
    }

    try {
      await this.edgeRiskAgent.stop();
    } catch (error) {
      this.logger.warn({ err: error }, "optional edge risk agent failed to stop cleanly");
    }

    this.logger.info({ signal }, "hermes edge supervisor stopped");
  }

  private handleRequest(request: IncomingMessage, response: ServerResponse): void {
    const requestUrl = request.url ?? "/";
    const method = request.method ?? "GET";

    if (method === "GET" && requestUrl === "/healthz") {
      const report = this.latestReport;
      this.respondJson(response, report?.accepted ? 200 : 503, {
        service: this.config.serviceName,
        generatedAt: report?.generatedAt ?? isoNow(),
        accepted: report?.accepted ?? false,
        currentBoundary: report?.currentBoundary ?? "hermes-edge-supervisor-needs-review",
        overallLevel: report?.summary.overallLevel ?? "critical",
      });
      return;
    }

    if (method === "GET" && requestUrl === "/v1/supervision") {
      if (!this.latestReport) {
        this.respondJson(response, 503, { error: "supervision_not_ready" });
        return;
      }

      this.respondJson(response, 200, this.latestReport);
      return;
    }

    if (method === "GET" && requestUrl === "/v1/edge-risk") {
      this.respondJson(response, 200, this.edgeRiskAgent.status());
      return;
    }

    if (method === "GET" && requestUrl === "/v1/actions") {
      this.respondJson(response, 200, {
        schema_version: 1,
        generatedAt: isoNow(),
        actions: this.recentActions,
      });
      return;
    }

    if (method === "GET" && requestUrl.startsWith("/v1/actions/")) {
      const actionId = requestUrl.replace("/v1/actions/", "").split("?")[0];
      const action = this.recentActions.find((candidate) => candidate.id === actionId);
      if (!action) {
        this.respondJson(response, 404, { error: "action_not_found" });
        return;
      }
      this.respondJson(response, 200, { schema_version: 1, action });
      return;
    }

    if (method === "GET" && requestUrl === "/v1/intent-catalog") {
      this.respondJson(response, 200, this.buildIntentCatalog());
      return;
    }

    if (method === "POST" && requestUrl.startsWith("/v1/actions/")) {
      void this.handleActionRequest(requestUrl, request, response);
      return;
    }

    if (method === "GET" && requestUrl === "/") {
      this.respondJson(response, 200, {
        service: this.config.serviceName,
        endpoints: [
          "/healthz",
          "/v1/supervision",
          "/v1/edge-risk",
          "/v1/actions",
          "/v1/intent-catalog",
          "POST /v1/actions/recheck",
        ],
      });
      return;
    }

    this.respondJson(response, 404, { error: "not_found" });
  }

  private respondJson(response: ServerResponse, statusCode: number, body: unknown): void {
    const payload = JSON.stringify(body, null, 2);
    response.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(payload, "utf8"),
    });
    response.end(payload);
  }

  private async handleActionRequest(
    requestUrl: string,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const actionName = requestUrl.replace("/v1/actions/", "").split("?")[0];
    if (
      actionName !== "recheck" &&
      actionName !== "collect_logs" &&
      actionName !== "generate_report"
    ) {
      this.respondJson(response, 404, { error: "unknown_action" });
      return;
    }

    const body = await this.readRequestJson(request);
    const naturalLanguageIntent = getString(body, "intent");
    const requestedBy = getString(body, "requestedBy") ?? "local-operator-or-display";

    const actionId = randomUUID();
    if (actionName === "recheck") {
      await this.refresh(true);
    }

    const report = this.latestReport;
    const result = await this.actionResult(actionId, actionName, report);
    const action: HermesAction = {
      id: actionId,
      createdAt: isoNow(),
      action: actionName,
      status: "completed",
      requestedBy,
      naturalLanguageIntent,
      summary: this.actionSummary(actionName, report),
      result,
    };

    await this.recordAction(action);
    this.respondJson(response, 202, {
      schema_version: 1,
      accepted: true,
      action,
      safetyBoundary: {
        readOnly: true,
        gatewayCoreTouched: false,
        serialTouched: false,
        mqttTouched: false,
        message:
          "Hermes action API only refreshes/collects sidecar evidence; it does not control field-gateway.",
      },
    });
  }

  private async readRequestJson(request: IncomingMessage): Promise<JsonObject | null> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const totalBytes = chunks.reduce((sum, item) => sum + item.length, 0);
      if (totalBytes > 64 * 1024) {
        return null;
      }
    }

    if (chunks.length === 0) return null;
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
      return isObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private async recordAction(action: HermesAction): Promise<void> {
    this.recentActions.unshift(action);
    this.recentActions.splice(25);
    const resolved = path.resolve(this.config.eventLogFilePath);
    await ensureDir(path.dirname(resolved));
    await fs.appendFile(resolved, `${JSON.stringify(action)}\n`, "utf8");
  }

  private async loadRecentActions(): Promise<void> {
    try {
      const raw = await fs.readFile(path.resolve(this.config.eventLogFilePath), "utf8");
      const lines = raw
        .split(/\r?\n/u)
        .filter((line) => line.trim().length > 0)
        .slice(-25);
      for (const line of lines.reverse()) {
        try {
          const parsed: unknown = JSON.parse(line);
          if (
            !isObject(parsed) ||
            typeof parsed.id !== "string" ||
            typeof parsed.createdAt !== "string" ||
            (parsed.action !== "recheck" &&
              parsed.action !== "collect_logs" &&
              parsed.action !== "generate_report")
          ) {
            continue;
          }
          this.recentActions.push(parsed as HermesAction);
        } catch {
          continue;
        }
      }
    } catch (error) {
      const code = isObject(error) && typeof error.code === "string" ? error.code : null;
      if (code !== "ENOENT") {
        this.logger.warn({ err: error }, "failed to restore Hermes action history");
      }
    }
  }

  private redactDiagnosticOutput(value: string): string {
    return value
      .replace(
        /(password|passwd|token|secret|authorization)(\s*[=:]\s*)[^\s,;]+/giu,
        "$1$2[REDACTED]"
      )
      .slice(0, 12_000);
  }

  private runReadOnlyCommand(command: string, args: string[]): Promise<DiagnosticCommandResult> {
    return new Promise((resolve) => {
      execFile(
        command,
        args,
        {
          timeout: this.config.actionCommandTimeoutMs,
          maxBuffer: 64 * 1024,
          encoding: "utf8",
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const code =
            error && typeof (error as { code?: unknown }).code === "number"
              ? (error as { code: number }).code
              : error
                ? 1
                : 0;
          resolve({
            command: [command, ...args].join(" "),
            ok: error === null,
            exitCode: code,
            stdout: this.redactDiagnosticOutput(stdout),
            stderr: this.redactDiagnosticOutput(stderr),
            error: error ? error.message : null,
          });
        }
      );
    });
  }

  private async collectDiagnosticBundle(
    actionId: string,
    report: SupervisionReport
  ): Promise<JsonObject> {
    const commands: Array<[string, string[]]> = [
      [
        "systemctl",
        [
          "show",
          "lsmv2-field-gateway.service",
          "lsmv2-field-link-monitor.service",
          "lsmv2-hermes-edge-supervisor.service",
          "--property=Id,ActiveState,SubState,NRestarts,MemoryCurrent,CPUUsageNSec",
          "--no-pager",
        ],
      ],
      [
        "journalctl",
        ["-u", "lsmv2-field-gateway.service", "-n", "80", "--no-pager", "-o", "short-iso"],
      ],
      [
        "journalctl",
        ["-u", "lsmv2-field-link-monitor.service", "-n", "80", "--no-pager", "-o", "short-iso"],
      ],
      [
        "journalctl",
        ["-u", "lsmv2-hermes-edge-supervisor.service", "-n", "80", "--no-pager", "-o", "short-iso"],
      ],
      ["ip", ["-brief", "address"]],
      ["ip", ["route", "show"]],
    ];
    const results = await Promise.all(
      commands.map(([command, args]) => this.runReadOnlyCommand(command, args))
    );
    const generatedAt = isoNow();
    const artifactName = `diagnostic-${actionId}.json`;
    const artifact = {
      schema_version: 1,
      actionId,
      generatedAt,
      supervision: {
        overallLevel: report.summary.overallLevel,
        diagnosisType: report.aiDiagnosis.diagnosisType,
        confidence: report.aiDiagnosis.confidence,
        localResources: report.localResources,
        edgeRiskLevel: report.edgeRiskAgent.overallRiskLevel,
        pendingUploadCount: report.edgeRiskAgent.pendingUploadCount,
      },
      commands: results,
    };
    await ensureDir(path.resolve(this.config.actionArtifactDir));
    await writeJsonAtomic(path.join(this.config.actionArtifactDir, artifactName), artifact);
    const collectedCommandCount = results.filter((result) => result.ok).length;
    return {
      reportReady: true,
      generatedAt,
      artifactName,
      collectedCommandCount,
      failedCommandCount: results.length - collectedCommandCount,
      diagnosisType: report.aiDiagnosis.diagnosisType,
      overallLevel: report.summary.overallLevel,
      evidence: results.map((result) => ({
        command: result.command,
        ok: result.ok,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
      })),
      note: "只读诊断证据已在 RK3568 本地落盘，口令和令牌字段已脱敏。",
    };
  }

  private async generateSituationReport(
    actionId: string,
    report: SupervisionReport
  ): Promise<JsonObject> {
    const generatedAt = isoNow();
    const artifactName = `situation-report-${actionId}.md`;
    const plan = report.aiDiagnosis.recommendedPlan.map((item) => `- ${item}`).join("\n");
    const content = [
      "# Hermes 边缘态势报告",
      "",
      `生成时间：${generatedAt}`,
      `总体状态：${report.summary.overallLevel}`,
      `边缘风险：${report.edgeRiskAgent.overallRiskLevel}`,
      `最高风险分：${String(report.edgeRiskAgent.maxRiskScore ?? "暂无")}`,
      `诊断类型：${report.aiDiagnosis.diagnosisType}`,
      `研判置信度：${String(Math.round(report.aiDiagnosis.confidence * 100))}%`,
      `节点数量：${String(report.edgeRiskAgent.devices.length)}`,
      `待上传任务：${String(report.edgeRiskAgent.pendingUploadCount)}`,
      "",
      "## 建议步骤",
      "",
      plan || "- 保持观察，等待下一次有效数据。",
      "",
      "## 安全边界",
      "",
      "本报告仅汇总旁路监督数据，未接管告警、串口采集或 MQTT 上行链路。",
      "",
    ].join("\n");
    await ensureDir(path.resolve(this.config.actionArtifactDir));
    await fs.writeFile(path.join(this.config.actionArtifactDir, artifactName), content, "utf8");
    return {
      reportReady: true,
      generatedAt,
      artifactName,
      reportText: content,
      overallLevel: report.summary.overallLevel,
      diagnosisType: report.aiDiagnosis.diagnosisType,
      confidence: report.aiDiagnosis.confidence,
      confidenceLevel: report.aiDiagnosis.confidenceLevel,
      taskCount: report.summary.taskCount,
      blockedCount: report.summary.blockedCount,
      recommendedPlan: report.aiDiagnosis.recommendedPlan,
      edgeRiskLevel: report.edgeRiskAgent.overallRiskLevel,
      edgeRiskScore: report.edgeRiskAgent.maxRiskScore,
      edgeRiskModelVersion: report.edgeRiskAgent.model.modelVersion,
      edgeAgentPendingUploads: report.edgeRiskAgent.pendingUploadCount,
    };
  }

  private actionSummary(action: HermesAction["action"], report: SupervisionReport | null): string {
    const diagnosis = report?.aiDiagnosis;
    if (action === "recheck") {
      return diagnosis
        ? `已完成边缘复检：${diagnosis.diagnosisType}，置信度 ${diagnosis.confidence}.`
        : "已触发边缘复检，但监督报告尚未就绪。";
    }
    if (action === "collect_logs") {
      return "已在 RK3568 采集只读链路证据并生成诊断记录。";
    }
    return "已生成当前 Hermes 边缘态势报告并保存记录。";
  }

  private async actionResult(
    actionId: string,
    action: HermesAction["action"],
    report: SupervisionReport | null
  ): Promise<JsonObject> {
    if (!report) {
      return { reportReady: false };
    }

    if (action === "collect_logs") {
      return this.collectDiagnosticBundle(actionId, report);
    }

    if (action === "generate_report") {
      return this.generateSituationReport(actionId, report);
    }

    return {
      reportReady: true,
      generatedAt: report.generatedAt,
      overallLevel: report.summary.overallLevel,
      diagnosisType: report.aiDiagnosis.diagnosisType,
      confidence: report.aiDiagnosis.confidence,
      confidenceLevel: report.aiDiagnosis.confidenceLevel,
      taskCount: report.summary.taskCount,
      blockedCount: report.summary.blockedCount,
      recommendedPlan: report.aiDiagnosis.recommendedPlan,
      edgeRiskLevel: report.edgeRiskAgent.overallRiskLevel,
      edgeRiskScore: report.edgeRiskAgent.maxRiskScore,
      edgeRiskModelVersion: report.edgeRiskAgent.model.modelVersion,
      edgeAgentPendingUploads: report.edgeRiskAgent.pendingUploadCount,
    };
  }

  private buildIntentCatalog(): JsonObject {
    return {
      schema_version: 1,
      generatedAt: isoNow(),
      mode: "safe_intent_catalog",
      description:
        "Natural-language/display layers should map user intent to these safe Hermes actions.",
      intents: [
        {
          action: "recheck",
          exampleUtterances: ["检查一下链路", "重新诊断 RK3568", "复检当前状态"],
          method: "POST",
          path: "/v1/actions/recheck",
          safety: "read-only refresh and model inference",
        },
        {
          action: "collect_logs",
          exampleUtterances: ["准备诊断日志", "我要看现场证据", "收集网关日志线索"],
          method: "POST",
          path: "/v1/actions/collect_logs",
          safety:
            "executes a fixed read-only diagnostic command set and stores a redacted artifact",
        },
        {
          action: "generate_report",
          exampleUtterances: ["生成当前报告", "告诉我现在是什么问题", "给评委展示边缘智能状态"],
          method: "POST",
          path: "/v1/actions/generate_report",
          safety: "summarizes latest supervision report into a local artifact",
        },
      ],
      prohibitedActions: [
        "open serial port",
        "restart field-gateway automatically",
        "change mqtt uplink ownership",
        "switch wifi without operator approval",
      ],
    };
  }

  private async refresh(forceRiskPublish = false): Promise<void> {
    const fetchedAt = isoNow();
    const [automationSource, summarySource, localResources] = await Promise.all([
      fetchJson(this.config.automationUrl),
      fetchJson(this.config.summaryUrl),
      this.collectLocalResources(),
    ]);
    try {
      await this.edgeRiskAgent.ingest(
        this.extractTelemetrySnapshots(summarySource.document),
        forceRiskPublish
      );
    } catch (error) {
      this.logger.warn(
        { err: error },
        "optional edge risk refresh failed; preserving core supervision report"
      );
    }
    const report = this.buildReport({
      automationDocument: automationSource.document,
      automationError: automationSource.error,
      summaryDocument: summarySource.document,
      summaryError: summarySource.error,
      localResources,
      fetchedAt,
    });
    this.latestReport = report;
    await writeJsonAtomic(this.config.supervisionFilePath, report);
  }

  private buildReport(input: {
    automationDocument: JsonObject | null;
    automationError: string | null;
    summaryDocument: JsonObject | null;
    summaryError: string | null;
    localResources: LocalResourceSnapshot;
    fetchedAt: string;
  }): SupervisionReport {
    const {
      automationDocument,
      automationError,
      summaryDocument,
      summaryError,
      localResources,
      fetchedAt,
    } = input;
    const tasks = this.extractTasks(automationDocument);
    const automationGeneratedAt = getString(automationDocument, "generatedAt");
    const summaryGeneratedAt = getString(summaryDocument, "generatedAt");
    const blockedCount = tasks.filter((task) => task.status === "blocked").length;
    const recommendedCount = tasks.filter((task) => task.status === "recommended").length;
    const clearCount = tasks.filter((task) => task.status === "clear").length;
    const safeAutomatableCount = tasks.filter((task) => task.safeToAutomate).length;
    const overallLevel = tasks.reduce<Level>(
      (current, task) => (levelRank(task.severity) > levelRank(current) ? task.severity : current),
      automationError || summaryError ? "critical" : "healthy"
    );
    const automationAgeSeconds = ageSeconds(automationGeneratedAt);
    const summaryAgeSeconds = ageSeconds(summaryGeneratedAt);
    const automationFresh =
      automationAgeSeconds === null ||
      automationAgeSeconds * 1000 <= this.config.sourceStaleAfterMs;
    const summaryFresh =
      summaryAgeSeconds === null || summaryAgeSeconds * 1000 <= this.config.sourceStaleAfterMs;
    const accepted =
      !automationError && !summaryError && automationFresh && summaryFresh && tasks.length > 0;
    const aiDiagnosis = this.runAiDiagnosis(
      summaryDocument ?? automationDocument,
      tasks,
      localResources
    );
    const edgeRiskAgent = this.edgeRiskAgent.status();

    return {
      schema_version: 1,
      generatedAt: isoNow(),
      service: this.config.serviceName,
      mode: "hermes-edge-supervisor",
      accepted,
      currentBoundary: accepted
        ? "hermes-edge-supervisor-ready"
        : "hermes-edge-supervisor-needs-review",
      source: {
        automationUrl: this.config.automationUrl,
        summaryUrl: this.config.summaryUrl,
        fetchedAt: automationError && summaryError ? null : fetchedAt,
        automationGeneratedAt,
        summaryGeneratedAt,
        automationAgeSeconds,
        summaryAgeSeconds,
        automationError,
        summaryError,
      },
      localResources,
      summary: {
        overallLevel,
        taskCount: tasks.length,
        blockedCount,
        recommendedCount,
        clearCount,
        safeAutomatableCount,
      },
      hermesPlan: {
        nextTasks: tasks,
        executionPolicy: "advisory_first",
        protectedCore: {
          gatewayCore: true,
          serialIngest: true,
          mqttUplink: true,
        },
      },
      aiDiagnosis,
      aiModels: [
        {
          modelKey: aiDiagnosis.modelKey,
          task: "edge_link_diagnosis",
          status: aiDiagnosis.modelLoaded ? "loaded" : "unavailable",
          modelType: aiDiagnosis.modelType,
          modelVersion: aiDiagnosis.modelVersion,
          featureCount: Object.keys(aiDiagnosis.featureVector).length,
          output: aiDiagnosis,
        },
      ],
      edgeRiskAgent,
      actionInterface: {
        mode: "safe_intent_router",
        endpoints: [
          "/v1/edge-risk",
          "/v1/intent-catalog",
          "/v1/actions",
          "POST /v1/actions/recheck",
          "POST /v1/actions/collect_logs",
          "POST /v1/actions/generate_report",
        ],
        supportedActions: ["recheck", "collect_logs", "generate_report"],
        safetyBoundary: "read_only_or_sidecar_only",
        naturalLanguageReady: true,
      },
    };
  }

  private extractTelemetrySnapshots(summaryDocument: JsonObject | null): EdgeTelemetrySnapshot[] {
    const dimensions = Array.isArray(summaryDocument?.dimensions) ? summaryDocument.dimensions : [];
    const snapshots: EdgeTelemetrySnapshot[] = [];
    for (const dimension of dimensions) {
      if (!isObject(dimension) || !isObject(dimension.evidence)) continue;
      const evidence = dimension.evidence;
      const deviceId = typeof evidence.deviceId === "string" ? evidence.deviceId : null;
      const latestTelemetry = isObject(evidence.latestTelemetry) ? evidence.latestTelemetry : null;
      const receivedAt =
        latestTelemetry && typeof latestTelemetry.receivedTs === "string"
          ? latestTelemetry.receivedTs
          : null;
      const metrics =
        latestTelemetry && isObject(latestTelemetry.metrics) ? latestTelemetry.metrics : null;
      if (!deviceId || !receivedAt || !metrics) continue;
      snapshots.push({ deviceId, receivedAt, metrics });
    }
    return snapshots;
  }

  private async collectLocalResources(): Promise<LocalResourceSnapshot> {
    const snapshot: LocalResourceSnapshot = {
      load1: null,
      memTotalMb: null,
      memAvailableMb: null,
      memAvailableRatio: null,
      diskTotalMb: null,
      diskFreeMb: null,
      diskFreeRatio: null,
      maxTemperatureC: null,
      error: null,
    };
    const errors: string[] = [];

    try {
      const loadRaw = await fs.readFile("/proc/loadavg", "utf8");
      const load1 = Number(loadRaw.trim().split(/\s+/)[0]);
      snapshot.load1 = Number.isFinite(load1) ? load1 : null;
    } catch (error) {
      errors.push(`loadavg:${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const memRaw = await fs.readFile("/proc/meminfo", "utf8");
      const meminfo = this.parseMeminfo(memRaw);
      snapshot.memTotalMb = meminfo.MemTotal ? Math.round(meminfo.MemTotal / 1024) : null;
      snapshot.memAvailableMb = meminfo.MemAvailable
        ? Math.round(meminfo.MemAvailable / 1024)
        : null;
      snapshot.memAvailableRatio =
        meminfo.MemTotal && meminfo.MemAvailable
          ? Number((meminfo.MemAvailable / meminfo.MemTotal).toFixed(4))
          : null;
    } catch (error) {
      errors.push(`meminfo:${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const statfs = await fs.statfs("/");
      const totalBytes = statfs.blocks * statfs.bsize;
      const freeBytes = statfs.bavail * statfs.bsize;
      snapshot.diskTotalMb = Math.round(totalBytes / 1024 / 1024);
      snapshot.diskFreeMb = Math.round(freeBytes / 1024 / 1024);
      snapshot.diskFreeRatio = totalBytes > 0 ? Number((freeBytes / totalBytes).toFixed(4)) : null;
    } catch (error) {
      errors.push(`statfs:${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const thermalRoot = "/sys/class/thermal";
      const entries = await fs.readdir(thermalRoot);
      const temperatures: number[] = [];
      for (const entry of entries.filter((item) => item.startsWith("thermal_zone"))) {
        try {
          const raw = await fs.readFile(path.join(thermalRoot, entry, "temp"), "utf8");
          const milliC = Number(raw.trim());
          if (Number.isFinite(milliC)) {
            temperatures.push(milliC / 1000);
          }
        } catch {
          // Ignore individual thermal zones; some kernels expose transient entries.
        }
      }
      snapshot.maxTemperatureC =
        temperatures.length > 0 ? Number(Math.max(...temperatures).toFixed(2)) : null;
    } catch (error) {
      errors.push(`thermal:${error instanceof Error ? error.message : String(error)}`);
    }

    snapshot.error = errors.length > 0 ? errors.join("; ") : null;
    return snapshot;
  }

  private parseMeminfo(raw: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Za-z_()]+):\s+(\d+)/.exec(line);
      if (match?.[1] && match[2]) {
        result[match[1]] = Number(match[2]);
      }
    }
    return result;
  }

  private async loadDiagnosisModel(): Promise<void> {
    const resolvedPath = path.resolve(this.config.diagnosisModelPath);
    try {
      const raw = await fs.readFile(resolvedPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!this.isDiagnosisModelArtifact(parsed)) {
        this.diagnosisModel = null;
        this.diagnosisModelError = "diagnosis model artifact shape is invalid";
        return;
      }
      this.diagnosisModel = parsed;
      this.diagnosisModelError = null;
    } catch (error) {
      this.diagnosisModel = null;
      this.diagnosisModelError = error instanceof Error ? error.message : String(error);
    }
  }

  private isDiagnosisModelArtifact(value: unknown): value is DiagnosisModelArtifact {
    if (!isObject(value)) return false;
    return (
      value.schemaVersion === "hermes-edge-diagnosis-random-forest.v1" &&
      value.modelType === "random_forest_classifier" &&
      typeof value.modelKey === "string" &&
      typeof value.modelVersion === "string" &&
      Array.isArray(value.featureKeys) &&
      Array.isArray(value.classLabels) &&
      isObject(value.forest) &&
      Array.isArray(value.forest.trees)
    );
  }

  private runAiDiagnosis(
    document: JsonObject | null,
    tasks: HermesTask[],
    localResources: LocalResourceSnapshot
  ): AiDiagnosis {
    const model = this.diagnosisModel;
    const featureVector = this.buildFeatureVector(document, tasks, localResources);
    if (!model) {
      return {
        modelKey: "not-loaded",
        modelVersion: "n/a",
        modelType: "random_forest_classifier",
        diagnosisType: "model_unavailable",
        confidence: 0,
        confidenceLevel: "low",
        summary: "Hermes 边缘诊断模型未加载，当前仅输出任务托管结果。",
        featureVector,
        classProbabilities: {},
        recommendedPlan: ["检查 DIAGNOSIS_MODEL_PATH 是否指向有效模型产物。"],
        modelLoaded: false,
        modelError: this.diagnosisModelError,
      };
    }

    const values = model.featureKeys.map((featureKey) => featureVector[featureKey] ?? 0);
    const probabilities = this.predictRandomForest(model, values);
    let bestIndex = 0;
    for (let index = 1; index < probabilities.length; index += 1) {
      if ((probabilities[index] ?? 0) > (probabilities[bestIndex] ?? 0)) {
        bestIndex = index;
      }
    }
    const diagnosisType = model.classLabels[bestIndex] ?? "unknown";
    const confidence = probabilities[bestIndex] ?? 0;
    const classProbabilities: Record<string, number> = {};
    model.classLabels.forEach((label, index) => {
      classProbabilities[label] = Number((probabilities[index] ?? 0).toFixed(6));
    });

    return {
      modelKey: model.modelKey,
      modelVersion: model.modelVersion,
      modelType: "random_forest_classifier",
      diagnosisType,
      confidence: Number(confidence.toFixed(6)),
      confidenceLevel: confidence >= 0.75 ? "high" : confidence >= 0.5 ? "medium" : "low",
      summary: this.diagnosisSummary(diagnosisType),
      featureVector,
      classProbabilities,
      recommendedPlan: this.diagnosisPlan(diagnosisType),
      modelLoaded: true,
      modelError: null,
    };
  }

  private predictRandomForest(model: DiagnosisModelArtifact, values: number[]): number[] {
    const totals = new Array(model.classLabels.length).fill(0) as number[];
    for (const tree of model.forest.trees) {
      const treeValues = this.predictTree(tree, values, model.classLabels.length);
      for (let index = 0; index < totals.length; index += 1) {
        totals[index] = (totals[index] ?? 0) + (treeValues[index] ?? 0);
      }
    }

    const sum = totals.reduce((acc, value) => acc + value, 0);
    if (sum <= 0) {
      return totals.map(() => 1 / Math.max(1, totals.length));
    }
    return totals.map((value) => value / sum);
  }

  private predictTree(tree: RandomForestTree, values: number[], classCount: number): number[] {
    let node = 0;
    while (tree.childrenLeft[node] !== -1 && tree.childrenRight[node] !== -1) {
      const featureIndex = tree.feature[node] ?? -1;
      const threshold = tree.threshold[node] ?? 0;
      const value = featureIndex >= 0 ? (values[featureIndex] ?? 0) : 0;
      const nextNode = value <= threshold ? tree.childrenLeft[node] : tree.childrenRight[node];
      node = nextNode ?? -1;
      if (node < 0) {
        break;
      }
    }

    const leafValues = tree.value[node] ?? [];
    const total = leafValues.reduce((acc, value) => acc + value, 0);
    if (total <= 0) {
      return new Array(classCount).fill(1 / Math.max(1, classCount)) as number[];
    }
    return Array.from({ length: classCount }, (_, index) => (leafValues[index] ?? 0) / total);
  }

  private buildFeatureVector(
    document: JsonObject | null,
    tasks: HermesTask[],
    localResources: LocalResourceSnapshot
  ): Record<string, number> {
    const dimensions = this.readDimensions(document);
    const southbound = dimensions.southbound_serial;
    const network = dimensions.network_bootstrap;
    const northbound = dimensions.northbound_publish;
    const parserNoise = dimensions.parser_noise;
    const interleaving = dimensions.source_interleaving;
    const gatewaySource = dimensions.gateway_health_source;
    const networkSource = dimensions.network_status_source;
    const nodeDimensions = Object.entries(dimensions)
      .filter(([key]) => key.startsWith("node_"))
      .map(([, value]) => value);
    const summary = isObject(document?.summary) ? document.summary : {};
    const allEvidenceText = JSON.stringify(tasks.map((task) => task.evidence)).toLowerCase();
    const taskEvidence = this.mergeTaskEvidence(tasks);
    const sources = this.readSources(document);
    const portStatus =
      getString(southbound?.evidence, "portStatus") ?? getString(taskEvidence, "portStatus");
    const networkMode = getString(network?.evidence, "mode") ?? getString(taskEvidence, "mode");
    const lastPublishedAgeSeconds =
      this.readNumber(northbound?.evidence, "lastPublishedAgeSeconds") ??
      this.readNumber(taskEvidence, "lastPublishedAgeSeconds");
    const serialOpen = (southbound?.evidence.serialOpen ?? taskEvidence.serialOpen) === true;
    const mqttConnected =
      (southbound?.evidence.mqttConnected ?? taskEvidence.mqttConnected) === true;
    const lastSerialReadAgeSeconds = this.readNumber(
      southbound?.evidence,
      "lastSerialReadAgeSeconds"
    );
    const nodeConfiguredCount =
      nodeDimensions.filter((dimension) => getString(dimension.evidence, "status") === "configured")
        .length ||
      tasks.filter((task) => getString(task.evidence, "status") === "configured").length;
    const nodeOfflineCount =
      nodeDimensions.filter((dimension) => getString(dimension.evidence, "status") === "offline")
        .length || tasks.filter((task) => getString(task.evidence, "status") === "offline").length;
    const nodeOnlineCount =
      nodeDimensions.filter((dimension) => getString(dimension.evidence, "status") === "online")
        .length || tasks.filter((task) => getString(task.evidence, "status") === "online").length;
    const nodeTelemetryMessagesTotal = nodeDimensions.reduce(
      (sum, dimension) => sum + (this.readNumber(dimension.evidence, "telemetryMessages") ?? 0),
      0
    );
    const nodeCommandForwardsTotal = nodeDimensions.reduce(
      (sum, dimension) => sum + (this.readNumber(dimension.evidence, "commandForwards") ?? 0),
      0
    );
    const nodeAckPublishesTotal = nodeDimensions.reduce(
      (sum, dimension) => sum + (this.readNumber(dimension.evidence, "ackPublishes") ?? 0),
      0
    );
    const nodeLastTelemetryAges = nodeDimensions
      .map((dimension) => this.readNumber(dimension.evidence, "lastTelemetryAgeSeconds"))
      .filter((value): value is number => value !== null);
    const nodeLastAckAges = nodeDimensions
      .map((dimension) => this.readNumber(dimension.evidence, "lastAckAgeSeconds"))
      .filter((value): value is number => value !== null);
    const criticalTaskCount = tasks.filter((task) => task.severity === "critical").length;
    const attentionTaskCount = tasks.filter((task) => task.severity === "attention").length;
    const degradedTaskCount = tasks.filter((task) => task.severity === "degraded").length;
    const blockedTaskCount = tasks.filter((task) => task.status === "blocked").length;
    const recommendedTaskCount = tasks.filter((task) => task.status === "recommended").length;
    const clearTaskCount = tasks.filter((task) => task.status === "clear").length;
    const safeAutomatableCount = tasks.filter((task) => task.safeToAutomate).length;
    const readOnlyTaskCount = tasks.filter((task) => task.automationScope === "read_only").length;
    const operatorRequiredTaskCount = tasks.filter(
      (task) => task.automationScope === "operator_required"
    ).length;
    const publishFailures =
      this.readNumber(northbound?.evidence, "publishFailures") ??
      this.readNumber(taskEvidence, "publishFailures") ??
      0;
    const schemaRejected =
      this.readNumber(parserNoise?.evidence, "schemaRejected") ??
      this.readNumber(taskEvidence, "schemaRejected") ??
      0;
    const interleavingWithMultipleSchemas =
      this.readNumber(interleaving?.evidence, "interleavingWithMultipleSchemas") ??
      this.readNumber(taskEvidence, "interleavingWithMultipleSchemas") ??
      0;
    const interleavingWithMultipleDeviceIds =
      this.readNumber(interleaving?.evidence, "interleavingWithMultipleDeviceIds") ??
      this.readNumber(taskEvidence, "interleavingWithMultipleDeviceIds") ??
      0;
    const networkLastErrorPresent =
      getString(network?.evidence, "lastError") || getString(taskEvidence, "lastError") ? 1 : 0;
    const summaryScore = this.readNumber(summary, "score") ?? 0;
    const summaryOverallLevelRank = levelRank(this.asLevel(getString(summary, "overallLevel")));
    const gatewaySourceExists = gatewaySource?.evidence.exists === true ? 1 : 0;
    const networkSourceExists = networkSource?.evidence.exists === true ? 1 : 0;
    const gatewaySourceErrorPresent = getString(gatewaySource?.evidence, "error") ? 1 : 0;
    const networkSourceErrorPresent = getString(networkSource?.evidence, "error") ? 1 : 0;
    const gatewaySourceStale =
      (this.readNumber(gatewaySource?.evidence, "ageSeconds") ?? 0) * 1000 >
      this.config.sourceStaleAfterMs
        ? 1
        : 0;
    const networkSourceStale =
      (this.readNumber(networkSource?.evidence, "ageSeconds") ?? 0) * 1000 >
      this.config.sourceStaleAfterMs
        ? 1
        : 0;
    const nodeTotalCount = Math.max(1, nodeConfiguredCount + nodeOfflineCount + nodeOnlineCount);
    const lastPublishedFreshnessBreach =
      lastPublishedAgeSeconds === null ||
      lastPublishedAgeSeconds * 1000 > this.config.sourceStaleAfterMs
        ? 1
        : 0;
    const serialOpenButNoRead = serialOpen && lastSerialReadAgeSeconds === null ? 1 : 0;
    const mqttConnectedButNoPublish = mqttConnected && lastPublishedAgeSeconds === null ? 1 : 0;
    const taskPressureScore =
      criticalTaskCount * 3 +
      degradedTaskCount * 2 +
      attentionTaskCount +
      blockedTaskCount * 2 +
      recommendedTaskCount;
    const resourcePressure =
      (localResources.memAvailableRatio !== null && localResources.memAvailableRatio < 0.15) ||
      (localResources.diskFreeRatio !== null && localResources.diskFreeRatio < 0.15) ||
      (localResources.maxTemperatureC !== null && localResources.maxTemperatureC > 75)
        ? 1
        : 0;

    return {
      serialOpen: serialOpen ? 1 : 0,
      mqttConnected: mqttConnected ? 1 : 0,
      portOnline: portStatus === "online" ? 1 : 0,
      portConfigured: portStatus === "configured" ? 1 : 0,
      networkStaConnected: networkMode === "sta_connected" ? 1 : 0,
      networkEthernetUplink: networkMode === "ethernet_uplink" ? 1 : 0,
      networkApFallback: networkMode === "ap_fallback" ? 1 : 0,
      summaryAccepted: document?.accepted === true ? 1 : 0,
      summaryScore,
      summaryOverallLevelRank,
      gatewaySourceExists,
      networkSourceExists,
      gatewaySourceErrorPresent,
      networkSourceErrorPresent,
      gatewaySourceStale,
      networkSourceStale,
      lastPublishedMissing: lastPublishedAgeSeconds === null ? 1 : 0,
      lastPublishedAgeSeconds: lastPublishedAgeSeconds ?? 0,
      lastPublishedFreshnessBreach,
      lastSerialReadMissing: lastSerialReadAgeSeconds === null ? 1 : 0,
      lastSerialReadAgeSeconds: lastSerialReadAgeSeconds ?? 0,
      serialOpenButNoRead,
      mqttConnectedButNoPublish,
      spoolPending:
        this.readNumber(northbound?.evidence, "spoolPending") ??
        this.readNumber(taskEvidence, "spoolPending") ??
        0,
      publishFailures,
      schemaRejected,
      rejectedWriteFailures:
        this.readNumber(parserNoise?.evidence, "rejectedWriteFailures") ??
        this.readNumber(taskEvidence, "rejectedWriteFailures") ??
        0,
      rejectedMessages:
        this.readNumber(parserNoise?.evidence, "rejectedMessages") ??
        this.readNumber(taskEvidence, "rejectedMessages") ??
        0,
      interleavingSuspected:
        this.readNumber(interleaving?.evidence, "interleavingSuspected") ??
        this.readNumber(taskEvidence, "interleavingSuspected") ??
        0,
      interleavingWithMultipleSchemas,
      interleavingWithMultipleDeviceIds,
      nodeConfiguredCount,
      nodeOfflineCount,
      nodeOnlineCount,
      nodeHealthyRatio: Number((nodeOnlineCount / nodeTotalCount).toFixed(4)),
      nodeTelemetryMessagesTotal,
      nodeCommandForwardsTotal,
      nodeAckPublishesTotal,
      nodeLastTelemetryMissingCount: Math.max(
        0,
        nodeDimensions.length - nodeLastTelemetryAges.length
      ),
      nodeMaxLastTelemetryAgeSeconds:
        nodeLastTelemetryAges.length > 0 ? Math.max(...nodeLastTelemetryAges) : 0,
      nodeLastAckMissingCount: Math.max(0, nodeDimensions.length - nodeLastAckAges.length),
      nodeMaxLastAckAgeSeconds: nodeLastAckAges.length > 0 ? Math.max(...nodeLastAckAges) : 0,
      gatewaySourceAgeSeconds: this.readNumber(sources.gatewayHealth, "ageSeconds") ?? 0,
      networkSourceAgeSeconds: this.readNumber(sources.networkStatus, "ageSeconds") ?? 0,
      networkLastErrorPresent,
      criticalTaskCount,
      attentionTaskCount,
      degradedTaskCount,
      blockedTaskCount,
      recommendedTaskCount,
      clearTaskCount,
      safeAutomatableCount,
      readOnlyTaskCount,
      operatorRequiredTaskCount,
      taskPressureScore,
      cpuLoad1: localResources.load1 ?? 0,
      cpuLoadPerCore: Number(((localResources.load1 ?? 0) / 4).toFixed(4)),
      memAvailableRatio: localResources.memAvailableRatio ?? 1,
      diskFreeRatio: localResources.diskFreeRatio ?? 1,
      maxTemperatureC: localResources.maxTemperatureC ?? 0,
      resourcePressure,
      hasEnetunreach: allEvidenceText.includes("enetunreach") ? 1 : 0,
      hasEconnrefused: allEvidenceText.includes("econnrefused") ? 1 : 0,
      hasTimeout: allEvidenceText.includes("timeout") ? 1 : 0,
    };
  }

  private mergeTaskEvidence(tasks: HermesTask[]): JsonObject {
    const merged: JsonObject = {};
    for (const task of tasks) {
      for (const [key, value] of Object.entries(task.evidence)) {
        if (merged[key] === undefined || merged[key] === null) {
          merged[key] = value;
        }
      }
    }
    return merged;
  }

  private readDimensions(
    document: JsonObject | null
  ): Record<string, { level: string | null; evidence: JsonObject }> {
    const dimensions: Record<string, { level: string | null; evidence: JsonObject }> = {};
    const rawDimensions = Array.isArray(document?.dimensions) ? document.dimensions : [];
    for (const rawDimension of rawDimensions) {
      if (!isObject(rawDimension)) continue;
      const key = getString(rawDimension, "key");
      if (!key) continue;
      dimensions[key] = {
        level: getString(rawDimension, "level"),
        evidence: isObject(rawDimension.evidence) ? rawDimension.evidence : {},
      };
    }
    return dimensions;
  }

  private readSources(document: JsonObject | null): {
    gatewayHealth: JsonObject;
    networkStatus: JsonObject;
  } {
    const sources = isObject(document?.sources) ? document.sources : {};
    return {
      gatewayHealth: isObject(sources.gatewayHealth) ? sources.gatewayHealth : {},
      networkStatus: isObject(sources.networkStatus) ? sources.networkStatus : {},
    };
  }

  private readNumber(value: unknown, key: string): number | null {
    if (!isObject(value)) return null;
    const next = value[key];
    return typeof next === "number" && Number.isFinite(next) ? next : null;
  }

  private diagnosisSummary(diagnosisType: string): string {
    switch (diagnosisType) {
      case "healthy_watch":
        return "边缘链路处于可观察稳定状态，Hermes 继续执行轻量巡检。";
      case "center_mqtt_route_unreachable":
        return "模型判断更可能是 RK3568 到中心 MQTT Broker 的网络路由不可达。";
      case "center_mqtt_service_unavailable":
        return "模型判断更可能是中心 MQTT 服务不可用或端口拒绝连接。";
      case "southbound_serial_or_gateway_gap":
        return "模型判断更可能是南向串口或网关采集链路存在缺口。";
      case "field_nodes_not_reporting":
        return "模型判断更可能是现场节点未形成有效上报。";
      case "shared_port_noise":
        return "模型判断共享串口存在解析噪声或源侧交错风险。";
      case "ap_fallback_backhaul_degraded":
        return "模型判断回传网络处于 AP fallback 或弱回传状态。";
      case "publish_backlog_pressure":
        return "模型判断上行发布存在缓存积压或新鲜度压力。";
      case "edge_resource_pressure":
        return "模型判断 RK3568 本地资源压力偏高，可能影响边缘侧巡检稳定性。";
      default:
        return "模型给出未知诊断类型，需要人工复核。";
    }
  }

  private diagnosisPlan(diagnosisType: string): string[] {
    switch (diagnosisType) {
      case "center_mqtt_route_unreachable":
        return [
          "检查 RK3568 到中心服务器 IP 的路由。",
          "检查中心服务器 1883 端口和防火墙。",
          "采集 field-gateway journal 中的 MQTT 错误。",
        ];
      case "center_mqtt_service_unavailable":
        return [
          "检查 EMQX/MQTT Broker 是否运行。",
          "确认 1883 端口监听。",
          "复核 MQTT 地址和认证配置。",
        ];
      case "southbound_serial_or_gateway_gap":
        return [
          "检查 /dev/ttyS3 是否仍被 field-gateway 独占。",
          "查看 field-gateway 健康文件的 serial 和 southbound 状态。",
          "人工确认后再考虑重启网关。",
        ];
      case "field_nodes_not_reporting":
        return [
          "检查现场节点供电和中心节点聚合链路。",
          "查看节点最近 telemetry 时间。",
          "保留节点 A/B/C 状态证据。",
        ];
      case "shared_port_noise":
        return [
          "采集 rejected/schemaRejected/interleaving 证据。",
          "复核中心节点共享流输出节奏。",
          "不要扩大 RK3568 parser 补丁面。",
        ];
      case "ap_fallback_backhaul_degraded":
        return [
          "检查 STA 网络和回传路由。",
          "确认是否进入维护热点模式。",
          "恢复回传前不要执行高风险远程动作。",
        ];
      case "publish_backlog_pressure":
        return [
          "检查 spool pending 变化趋势。",
          "确认 MQTT 连接质量。",
          "观察 publish freshness 是否恢复。",
        ];
      case "edge_resource_pressure":
        return [
          "检查 CPU load、内存、磁盘和温度。",
          "清理非主链路旧产物或降低旁路服务频率。",
          "不要因资源压力自动重启 field-gateway。",
        ];
      case "healthy_watch":
        return ["保持 Hermes 轻量巡检。", "继续记录 supervision 摘要。"];
      default:
        return ["人工复核模型输出和原始证据。"];
    }
  }

  private extractTasks(document: JsonObject | null): HermesTask[] {
    if (!document || !Array.isArray(document.tasks)) {
      return [];
    }

    return document.tasks.filter(isObject).map((task): HermesTask => ({
      key: getString(task, "key") ?? "unknown_task",
      title: getString(task, "title") ?? "未命名 Hermes 任务",
      severity: this.asLevel(getString(task, "severity")),
      status: getString(task, "status") ?? "recommended",
      trigger: getString(task, "trigger") ?? "no trigger provided",
      safeToAutomate: task.safeToAutomate === true,
      automationScope: getString(task, "automationScope") ?? "operator_required",
      evidence: isObject(task.evidence) ? task.evidence : {},
      operatorAction: getString(task, "operatorAction") ?? "记录证据并等待人工确认。",
    }));
  }

  private asLevel(value: string | null): Level {
    if (
      value === "healthy" ||
      value === "attention" ||
      value === "degraded" ||
      value === "critical"
    ) {
      return value;
    }
    return "attention";
  }
}

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
  const config = loadConfigFromEnv(process.env);
  const supervisor = new HermesEdgeSupervisor(config);
  await supervisor.start();

  const shutdown = async (signal: string) => {
    await supervisor.stop(signal);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main();
