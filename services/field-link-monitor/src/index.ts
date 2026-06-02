import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import dotenv from "dotenv";
import { createLogger } from "@lsmv2/observability";
import { loadConfigFromEnv, type AppConfig } from "./config";

type JsonObject = Record<string, unknown>;
type Level = "healthy" | "attention" | "degraded" | "critical";

type SourceSnapshot = {
  path: string;
  exists: boolean;
  generatedAt: string | null;
  ageSeconds: number | null;
  error: string | null;
};

type Dimension = {
  key: string;
  level: Level;
  summary: string;
  evidence: Record<string, unknown>;
};

type AutomationTaskStatus = "clear" | "recommended" | "blocked";
type AutomationScope = "read_only" | "sidecar_only" | "operator_required";

type AutomationTask = {
  key: string;
  title: string;
  severity: Level;
  status: AutomationTaskStatus;
  trigger: string;
  evidence: Record<string, unknown>;
  operatorAction: string;
  safeToAutomate: boolean;
  automationScope: AutomationScope;
};

type AutomationPlanReport = {
  schema_version: 1;
  generatedAt: string;
  mode: "rk3568-edge-supervision-plan";
  sourceSummaryGeneratedAt: string;
  accepted: boolean;
  currentBoundary: "rk3568-edge-supervision-ready" | "rk3568-edge-supervision-needs-review";
  overallLevel: Level;
  tasks: AutomationTask[];
  governance: {
    openClawHermesBoundary: "consume-read-only-plan";
    gatewayCoreProtected: true;
    serialIngestProtected: true;
    mqttUplinkProtected: true;
    safeActionPolicy: "advisory-first-no-gateway-restart";
  };
};

type LinkSummaryReport = {
  schema_version: 1;
  generatedAt: string;
  service: string;
  mode: "rk3568-edge-link-monitor";
  accepted: boolean;
  currentBoundary: "rk3568-edge-link-monitor-ready" | "rk3568-edge-link-monitor-needs-review";
  summary: {
    overallLevel: Level;
    score: number;
    networkMode: string | null;
    serialOpen: boolean;
    mqttConnected: boolean;
    portStatus: string | null;
    spoolPending: number | null;
    rejectedWriteFailures: number | null;
    rejectedMessages: number | null;
    interleavingSuspected: number | null;
    lastPublishedAgeSeconds: number | null;
    httpHost: string;
    httpPort: number;
  };
  dimensions: Dimension[];
  sources: {
    gatewayHealth: SourceSnapshot;
    networkStatus: SourceSnapshot;
  };
  recommendations: string[];
  automation: AutomationPlanReport;
};

type ReadJsonResult = {
  exists: boolean;
  document: JsonObject | null;
  error: string | null;
};

function isoNow(): string {
  return new Date().toISOString();
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getObject(value: unknown, key: string): JsonObject | null {
  if (!isObject(value)) return null;
  const next = value[key];
  return isObject(next) ? next : null;
}

function getArray(value: unknown, key: string): unknown[] {
  if (!isObject(value)) return [];
  const next = value[key];
  return Array.isArray(next) ? next : [];
}

function getString(value: unknown, key: string): string | null {
  if (!isObject(value)) return null;
  const next = value[key];
  return typeof next === "string" && next.trim().length > 0 ? next : null;
}

function getBoolean(value: unknown, key: string): boolean {
  if (!isObject(value)) return false;
  return value[key] === true;
}

function getNumber(value: unknown, key: string): number | null {
  if (!isObject(value)) return null;
  const next = value[key];
  return typeof next === "number" && Number.isFinite(next) ? next : null;
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

function newDimension(key: string, level: Level, summary: string, evidence: Record<string, unknown>): Dimension {
  return { key, level, summary, evidence };
}

function newAutomationTask(
  key: string,
  title: string,
  severity: Level,
  status: AutomationTaskStatus,
  trigger: string,
  evidence: Record<string, unknown>,
  operatorAction: string,
  automationScope: AutomationScope
): AutomationTask {
  return {
    key,
    title,
    severity,
    status,
    trigger,
    evidence,
    operatorAction,
    safeToAutomate: automationScope === "sidecar_only",
    automationScope
  };
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

async function readJsonFile(filePath: string): Promise<ReadJsonResult> {
  const resolved = path.resolve(filePath);
  try {
    const raw = await fs.readFile(resolved, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) {
      return { exists: true, document: null, error: "json root is not an object" };
    }

    return { exists: true, document: parsed, error: null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, document: null, error: null };
    }

    return {
      exists: true,
      document: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

class FieldLinkMonitor {
  private readonly logger: ReturnType<typeof createLogger>;
  private refreshTimer: NodeJS.Timeout | null = null;
  private server: http.Server | null = null;
  private latestSummary: LinkSummaryReport | null = null;

  constructor(private readonly config: AppConfig) {
    this.logger = createLogger(config.serviceName);
  }

  async start(): Promise<void> {
    await this.refreshSummary();
    this.refreshTimer = setInterval(() => {
      void this.refreshSummary();
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
        httpHost: this.config.httpHost,
        httpPort: this.config.httpPort,
        gatewayHealthFilePath: this.config.gatewayHealthFilePath,
        networkStatusFilePath: this.config.networkStatusFilePath,
        summaryFilePath: this.config.summaryFilePath
      },
      "field link monitor started"
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

    this.logger.info({ signal }, "field link monitor stopped");
  }

  private handleRequest(request: IncomingMessage, response: ServerResponse): void {
    const requestUrl = request.url ?? "/";
    const method = request.method ?? "GET";

    if (method !== "GET") {
      this.respondJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    if (requestUrl === "/healthz") {
      const summary = this.latestSummary;
      this.respondJson(response, summary?.accepted ? 200 : 503, {
        service: this.config.serviceName,
        generatedAt: summary?.generatedAt ?? isoNow(),
        accepted: summary?.accepted ?? false,
        currentBoundary: summary?.currentBoundary ?? "rk3568-edge-link-monitor-needs-review",
        overallLevel: summary?.summary.overallLevel ?? "critical"
      });
      return;
    }

    if (requestUrl === "/v1/summary") {
      if (!this.latestSummary) {
        this.respondJson(response, 503, { error: "summary_not_ready" });
        return;
      }

      this.respondJson(response, 200, this.latestSummary);
      return;
    }

    if (requestUrl === "/v1/automation") {
      if (!this.latestSummary) {
        this.respondJson(response, 503, { error: "automation_not_ready" });
        return;
      }

      this.respondJson(response, 200, this.latestSummary.automation);
      return;
    }

    if (requestUrl === "/") {
      this.respondJson(response, 200, {
        service: this.config.serviceName,
        endpoints: ["/healthz", "/v1/summary", "/v1/automation"]
      });
      return;
    }

    this.respondJson(response, 404, { error: "not_found" });
  }

  private respondJson(response: ServerResponse, statusCode: number, body: unknown): void {
    const payload = JSON.stringify(body, null, 2);
    response.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(payload, "utf8")
    });
    response.end(payload);
  }

  private async refreshSummary(): Promise<void> {
    const [gatewayResult, networkResult] = await Promise.all([
      readJsonFile(this.config.gatewayHealthFilePath),
      readJsonFile(this.config.networkStatusFilePath)
    ]);

    const report = this.buildSummary(gatewayResult, networkResult);
    this.latestSummary = report;
    await writeJsonAtomic(this.config.summaryFilePath, report);
  }

  private buildSummary(gatewayResult: ReadJsonResult, networkResult: ReadJsonResult): LinkSummaryReport {
    const gatewayDoc = gatewayResult.document;
    const networkDoc = networkResult.document;
    const gatewayGeneratedAt = getString(gatewayDoc, "emitted_ts");
    const networkGeneratedAt = getString(networkDoc, "generatedAt");
    const gatewaySource = this.buildSourceSnapshot(this.config.gatewayHealthFilePath, gatewayResult, gatewayGeneratedAt);
    const networkSource = this.buildSourceSnapshot(this.config.networkStatusFilePath, networkResult, networkGeneratedAt);
    const gatewaySerial = getObject(gatewayDoc, "serial");
    const gatewayMqtt = getObject(gatewayDoc, "mqtt");
    const southbound = getObject(gatewayDoc, "southbound");
    const stats = getObject(gatewayDoc, "stats");
    const runtimeMode = getString(networkDoc, "mode");
    const networkLastError = getString(networkDoc, "lastError");
    const ports = getArray(southbound, "ports");
    const firstPort = ports.find((port) => isObject(port)) ?? null;
    const serialOpen = getBoolean(gatewaySerial, "open");
    const mqttConnected = getBoolean(gatewayMqtt, "connected");
    const portStatus = getString(firstPort, "status");
    const spoolPending = getNumber(stats, "spoolPending");
    const rejectedWriteFailures = getNumber(stats, "rejectedWriteFailures");
    const rejectedMessages = getNumber(stats, "rejectedMessages");
    const schemaRejected = getNumber(stats, "schemaRejected");
    const interleavingSuspected = getNumber(stats, "interleavingSuspected");
    const interleavingWithMultipleSchemas = getNumber(stats, "interleavingWithMultipleSchemas");
    const interleavingWithMultipleDeviceIds = getNumber(stats, "interleavingWithMultipleDeviceIds");
    const publishFailures = getNumber(stats, "publishFailures");
    const lastPublishedAgeSeconds = ageSeconds(getString(stats, "lastPublishedTs"));
    const lastSerialReadAgeSeconds = ageSeconds(getString(stats, "lastSerialReadTs"));
    const lastInterleavingAgeSeconds = ageSeconds(getString(stats, "lastInterleavingTs"));
    const dimensions: Dimension[] = [];

    dimensions.push(
      newDimension("gateway_health_source", this.sourceLevel(gatewaySource),
        gatewaySource.exists && !gatewaySource.error
          ? "field gateway runtime health source is readable"
          : "field gateway runtime health source is missing or unreadable",
        {
          path: gatewaySource.path,
          exists: gatewaySource.exists,
          generatedAt: gatewaySource.generatedAt,
          ageSeconds: gatewaySource.ageSeconds,
          error: gatewaySource.error
        })
    );

    dimensions.push(
      newDimension("network_status_source", this.sourceLevel(networkSource),
        networkSource.exists && !networkSource.error
          ? "network bootstrap status source is readable"
          : "network bootstrap status source is missing or unreadable",
        {
          path: networkSource.path,
          exists: networkSource.exists,
          generatedAt: networkSource.generatedAt,
          ageSeconds: networkSource.ageSeconds,
          error: networkSource.error
        })
    );

    const networkLevel: Level =
      runtimeMode === "sta_connected" ? "healthy" : runtimeMode === "ap_fallback" ? "attention" : "critical";
    dimensions.push(
      newDimension("network_bootstrap", networkLevel,
        runtimeMode === "sta_connected"
          ? "rk3568 network bootstrap is in sta_connected"
          : runtimeMode === "ap_fallback"
            ? "rk3568 network bootstrap has fallen back to AP mode"
            : "rk3568 network bootstrap is not in a steady-state mode",
        {
          mode: runtimeMode,
          lastError: networkLastError,
          wifiDevice: getString(networkDoc, "wifiDevice"),
          lastAction: getString(networkDoc, "lastAction")
        })
    );

    const southboundLevel: Level = serialOpen && mqttConnected && portStatus === "online" ? "healthy" : "critical";
    dimensions.push(
      newDimension("southbound_serial", southboundLevel,
        southboundLevel === "healthy"
          ? "serial input and mqtt uplink are both online"
          : "serial input or mqtt uplink is not online",
        {
          serialOpen,
          mqttConnected,
          portStatus,
          lastSerialReadAgeSeconds
        })
    );

    let publishLevel: Level = "healthy";
    if (lastPublishedAgeSeconds === null || lastPublishedAgeSeconds * 1000 > this.config.publishFreshnessMs) {
      publishLevel = "critical";
    } else if ((spoolPending ?? 0) > 0 || getString(stats, "lastError")) {
      publishLevel = "attention";
    }
    dimensions.push(
      newDimension("northbound_publish", publishLevel,
        publishLevel === "healthy"
          ? "publish path is fresh within budget"
          : publishLevel === "attention"
            ? "publish path is fresh but showing backlog or retry pressure"
            : "publish path freshness is outside the local operator budget",
        {
          lastPublishedAgeSeconds,
          spoolPending,
          publishFailures,
          lastError: getString(stats, "lastError")
        })
    );

    let parserNoiseLevel: Level = "healthy";
    if ((rejectedWriteFailures ?? 0) > 0) {
      parserNoiseLevel = "critical";
    } else if ((schemaRejected ?? 0) > 0 || (rejectedMessages ?? 0) > 0) {
      parserNoiseLevel = "attention";
    }
    dimensions.push(
      newDimension("parser_noise", parserNoiseLevel,
        parserNoiseLevel === "healthy"
          ? "parser rejection counters are currently clear"
          : parserNoiseLevel === "attention"
            ? "shared-port parser noise is visible but not causing rejected writes"
            : "parser rejection is causing rejected write failures",
        {
          schemaRejected,
          rejectedMessages,
          rejectedWriteFailures
        })
    );

    let sourceInterleavingLevel: Level = "healthy";
    if ((interleavingSuspected ?? 0) > 0) {
      sourceInterleavingLevel = "attention";
    }
    dimensions.push(
      newDimension("source_interleaving", sourceInterleavingLevel,
        sourceInterleavingLevel === "healthy"
          ? "no source-side interleaving signature is currently recorded"
          : "shared-port rejected evidence contains source-side interleaving signatures",
        {
          interleavingSuspected,
          interleavingWithMultipleSchemas,
          interleavingWithMultipleDeviceIds,
          lastInterleavingAgeSeconds,
          lastInterleavingSummary: getString(stats, "lastInterleavingSummary")
        })
    );

    const nodeEntries = getArray(southbound, "nodes").filter(isObject);
    for (const node of nodeEntries) {
      const fieldNodeId = getString(node, "fieldNodeId") ?? "unknown";
      const status = getString(node, "status") ?? "unknown";
      const nodeLevel: Level =
        status === "online" ? "healthy" : status === "degraded" ? "attention" : status === "offline" ? "degraded" : "critical";
      dimensions.push(
        newDimension(`node_${fieldNodeId.toLowerCase()}`, nodeLevel, `node ${fieldNodeId} status=${status}`, {
          deviceId: getString(node, "deviceId"),
          status,
          telemetryMessages: getNumber(node, "telemetryMessages"),
          commandForwards: getNumber(node, "commandForwards"),
          ackPublishes: getNumber(node, "ackPublishes"),
          lastTelemetryAgeSeconds: ageSeconds(getString(node, "lastTelemetryTs")),
          lastAckAgeSeconds: ageSeconds(getString(node, "lastAckTs"))
        })
      );
    }

    let overallLevel: Level = "healthy";
    let score = 100;
    for (const dimension of dimensions) {
      switch (dimension.level) {
        case "attention":
          score -= 10;
          break;
        case "degraded":
          score -= 25;
          break;
        case "critical":
          score -= 40;
          break;
      }
      if (levelRank(dimension.level) > levelRank(overallLevel)) {
        overallLevel = dimension.level;
      }
    }
    score = Math.max(0, score);

    const accepted = gatewaySource.exists && !gatewaySource.error && networkSource.exists && !networkSource.error;
    const summaryReport: Omit<LinkSummaryReport, "automation"> = {
      schema_version: 1,
      generatedAt: isoNow(),
      service: this.config.serviceName,
      mode: "rk3568-edge-link-monitor",
      accepted,
      currentBoundary: accepted ? "rk3568-edge-link-monitor-ready" : "rk3568-edge-link-monitor-needs-review",
      summary: {
        overallLevel,
        score,
        networkMode: runtimeMode,
        serialOpen,
        mqttConnected,
        portStatus,
        spoolPending,
        rejectedWriteFailures,
        rejectedMessages,
        interleavingSuspected,
        lastPublishedAgeSeconds,
        httpHost: this.config.httpHost,
        httpPort: this.config.httpPort
      },
      dimensions,
      sources: {
        gatewayHealth: gatewaySource,
        networkStatus: networkSource
      },
      recommendations: [
        "consume this summary from local UI or OpenClaw only in read-only mode",
        "treat parser_noise as a quality signal for shared-port governance, not as a reason to reopen the gateway core boundary",
        "escalate when source files disappear, southbound_serial leaves healthy, or rejectedWriteFailures becomes non-zero"
      ]
    };

    return {
      ...summaryReport,
      automation: this.buildAutomationPlan(summaryReport)
    };
  }

  private buildAutomationPlan(summary: Omit<LinkSummaryReport, "automation">): AutomationPlanReport {
    const tasks: AutomationTask[] = [];
    const getDimension = (key: string): Dimension | null => summary.dimensions.find((dimension) => dimension.key === key) ?? null;

    for (const sourceKey of ["gateway_health_source", "network_status_source"]) {
      const dimension = getDimension(sourceKey);
      if (dimension && levelRank(dimension.level) >= levelRank("attention")) {
        tasks.push(
          newAutomationTask(
            `${sourceKey}_refresh`,
            sourceKey === "gateway_health_source" ? "刷新网关健康证据" : "刷新网络引导证据",
            dimension.level,
            "recommended",
            dimension.summary,
            dimension.evidence,
            "检查对应 systemd 服务是否仍在写入状态文件；OpenClaw/Hermes 只读取该计划，不直接替代源服务写入。",
            "operator_required"
          )
        );
      }
    }

    const network = getDimension("network_bootstrap");
    if (network && network.level !== "healthy") {
      tasks.push(
        newAutomationTask(
          "network_bootstrap_review",
          "复核 RK3568 回传网络模式",
          network.level,
          "recommended",
          network.summary,
          network.evidence,
          "若处于 AP fallback，优先现场确认 STA 回传、路由器和供电；不要由 OpenClaw/Hermes 自动切 Wi-Fi。",
          "operator_required"
        )
      );
    }

    const southbound = getDimension("southbound_serial");
    if (southbound && southbound.level !== "healthy") {
      tasks.push(
        newAutomationTask(
          "southbound_serial_guard",
          "保护串口采集主链路",
          southbound.level,
          "blocked",
          southbound.summary,
          southbound.evidence,
          "该问题影响串口或 MQTT 主链路，只允许告警和取证；禁止 sidecar 自动重启 field-gateway。",
          "operator_required"
        )
      );
    }

    const northbound = getDimension("northbound_publish");
    if (northbound && northbound.level !== "healthy") {
      tasks.push(
        newAutomationTask(
          "northbound_publish_drain",
          "检查上行新鲜度与缓存压力",
          northbound.level,
          "recommended",
          northbound.summary,
          northbound.evidence,
          "先采集摘要、spool 和 MQTT 状态证据；是否重启主网关必须由人工确认。",
          "operator_required"
        )
      );
    }

    const parserNoise = getDimension("parser_noise");
    if (parserNoise && parserNoise.level !== "healthy") {
      tasks.push(
        newAutomationTask(
          "shared_port_noise_evidence",
          "收集共享串口解析噪声证据",
          parserNoise.level,
          "recommended",
          parserNoise.summary,
          parserNoise.evidence,
          "保留 rejected/schemaRejected/rejectedWriteFailures 证据，用于判断源侧聚合流质量，不扩大 RK3568 parser 补丁面。",
          "read_only"
        )
      );
    }

    const interleaving = getDimension("source_interleaving");
    if (interleaving && interleaving.level !== "healthy") {
      tasks.push(
        newAutomationTask(
          "source_interleaving_review",
          "复核源侧共享流交错",
          interleaving.level,
          "recommended",
          interleaving.summary,
          interleaving.evidence,
          "将该信号交给中心节点/源侧控制策略复核；RK3568 侧只保留旁路观测和证据。",
          "read_only"
        )
      );
    }

    for (const dimension of summary.dimensions.filter((item) => item.key.startsWith("node_") && item.level !== "healthy")) {
      tasks.push(
        newAutomationTask(
          `${dimension.key}_field_check`,
          "复核现场节点状态",
          dimension.level,
          "recommended",
          dimension.summary,
          dimension.evidence,
          "检查节点供电、安装点、通信路径和最近遥测时间；自动化层只生成派工线索。",
          "operator_required"
        )
      );
    }

    if (tasks.length === 0) {
      tasks.push(
        newAutomationTask(
          "steady_state_watch",
          "维持只读巡检",
          "healthy",
          "clear",
          "all monitored dimensions are within current budget",
          {
            score: summary.summary.score,
            overallLevel: summary.summary.overallLevel,
            networkMode: summary.summary.networkMode,
            serialOpen: summary.summary.serialOpen,
            mqttConnected: summary.summary.mqttConnected
          },
          "保持 field-link-monitor 只读巡检；OpenClaw/Hermes 可展示状态，但无需执行动作。",
          "read_only"
        )
      );
    }

    const overallLevel = tasks.reduce<Level>((current, task) => (
      levelRank(task.severity) > levelRank(current) ? task.severity : current
    ), "healthy");

    const accepted = summary.accepted && !tasks.some((task) => task.status === "blocked");
    return {
      schema_version: 1,
      generatedAt: isoNow(),
      mode: "rk3568-edge-supervision-plan",
      sourceSummaryGeneratedAt: summary.generatedAt,
      accepted,
      currentBoundary: accepted ? "rk3568-edge-supervision-ready" : "rk3568-edge-supervision-needs-review",
      overallLevel,
      tasks,
      governance: {
        openClawHermesBoundary: "consume-read-only-plan",
        gatewayCoreProtected: true,
        serialIngestProtected: true,
        mqttUplinkProtected: true,
        safeActionPolicy: "advisory-first-no-gateway-restart"
      }
    };
  }

  private buildSourceSnapshot(pathValue: string, result: ReadJsonResult, generatedAt: string | null): SourceSnapshot {
    return {
      path: path.resolve(pathValue),
      exists: result.exists,
      generatedAt,
      ageSeconds: ageSeconds(generatedAt),
      error: result.error
    };
  }

  private sourceLevel(snapshot: SourceSnapshot): Level {
    if (!snapshot.exists || snapshot.error) {
      return "critical";
    }
    if (snapshot.ageSeconds !== null && snapshot.ageSeconds * 1000 > this.config.sourceStaleAfterMs) {
      return "attention";
    }
    return "healthy";
  }
}

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
  const config = loadConfigFromEnv(process.env);
  const monitor = new FieldLinkMonitor(config);
  await monitor.start();

  const shutdown = async (signal: string) => {
    await monitor.stop(signal);
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
