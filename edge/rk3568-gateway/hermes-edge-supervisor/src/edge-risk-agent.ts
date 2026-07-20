import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  evaluateEdgeRisk,
  isEdgeRiskModelArtifact,
  toAiPredictionRiskLevel,
  type EdgeRiskEvaluation,
  type EdgeRiskLevel,
  type EdgeRiskModelArtifact,
  type EdgeTelemetrySnapshot,
} from "@lsmv2/edge-risk-model";
import mqtt, { type MqttClient } from "mqtt";
import type { AppConfig } from "./config";

type AiPredictionEventV1 = {
  schema_version: 1;
  prediction_id: string;
  created_ts: string;
  device_id: string;
  station_id: string | null;
  model_key: string;
  model_version: string | null;
  horizon_seconds: number;
  predicted_ts: string;
  risk_score: number;
  risk_level: "low" | "medium" | "high" | null;
  explain: string | null;
  payload: Record<string, unknown>;
};

export type EdgeAgentTask = {
  taskId: string;
  taskKey: string;
  title: string;
  status: "queued" | "running" | "completed" | "failed";
  trigger: string;
  deviceId: string | null;
  createdAt: string;
  completedAt: string | null;
  verification: string;
};

export type EdgeRiskAgentStatus = {
  mode: "hermes-edge-risk-agent";
  generatedAt: string;
  available: boolean;
  mqttConnected: boolean;
  model: {
    loaded: boolean;
    modelKey: string | null;
    modelVersion: string | null;
    trainedAt: string | null;
    trainingSource: string | null;
    error: string | null;
  };
  overallRiskLevel: EdgeRiskLevel | "unavailable";
  maxRiskScore: number | null;
  hardRuleTriggered: boolean;
  devices: EdgeRiskEvaluation[];
  tasks: EdgeAgentTask[];
  pendingUploadCount: number;
  runtimeError: string | null;
};

type PersistedAgentState = {
  schemaVersion: 1;
  pendingEvents: AiPredictionEventV1[];
  recentTasks: EdgeAgentTask[];
};

type PublishState = {
  publishedAtMs: number;
  riskLevel: EdgeRiskLevel;
  hardRuleTriggered: boolean;
};

function levelRank(level: EdgeRiskLevel): number {
  if (level === "danger") return 3;
  if (level === "warning") return 2;
  if (level === "attention") return 1;
  return 0;
}

function hasValidChecksum(artifact: EdgeRiskModelArtifact): boolean {
  if (!artifact.checksumSha256) return false;
  const expected = createHash("sha256")
    .update(JSON.stringify({ ...artifact, checksumSha256: null }))
    .digest("hex");
  return expected === artifact.checksumSha256.toLowerCase();
}

async function writeJsonAtomic(targetPath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${String(process.pid)}.${String(Date.now())}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temporaryPath, targetPath);
}

export class EdgeRiskAgent {
  private mqttClient: MqttClient | null = null;
  private model: EdgeRiskModelArtifact | null = null;
  private modelError: string | null = null;
  private runtimeError: string | null = null;
  private readonly histories = new Map<string, EdgeTelemetrySnapshot[]>();
  private readonly evaluations = new Map<string, EdgeRiskEvaluation>();
  private readonly publishStates = new Map<string, PublishState>();
  private pendingEvents: AiPredictionEventV1[] = [];
  private recentTasks: EdgeAgentTask[] = [];

  constructor(private readonly config: AppConfig) {}

  async start(): Promise<void> {
    await this.loadPersistedState();
    await this.loadModelFromDisk();
    if (!this.config.mqttUrl) return;
    this.mqttClient = mqtt.connect(this.config.mqttUrl, {
      clientId: this.config.mqttClientId,
      ...(this.config.mqttUsername ? { username: this.config.mqttUsername } : {}),
      ...(this.config.mqttPassword ? { password: this.config.mqttPassword } : {}),
      clean: true,
      reconnectPeriod: 5000,
    });
    this.mqttClient.on("connect", () => {
      this.runtimeError = null;
      this.mqttClient?.subscribe(this.config.mqttModelTopic, { qos: 1 }, (error) => {
        if (error) this.runtimeError = `MQTT 模型订阅失败：${error.message}`;
      });
      void this.flushPendingEvents().catch((error: unknown) =>
        this.captureRuntimeError("离线队列上传失败", error)
      );
    });
    this.mqttClient.on("message", (topic, payload) => {
      if (topic !== this.config.mqttModelTopic) return;
      void this.acceptModel(payload.toString("utf8")).catch((error: unknown) =>
        this.captureRuntimeError("模型激活失败", error)
      );
    });
    this.mqttClient.on("error", (error) => this.captureRuntimeError("MQTT 连接异常", error));
  }

  async stop(): Promise<void> {
    await this.safePersistState();
    this.mqttClient?.end(true);
    this.mqttClient = null;
  }

  async ingest(snapshots: EdgeTelemetrySnapshot[], forcePublish = false): Promise<void> {
    if (!this.model) return;
    const publishTasks: Promise<void>[] = [];
    for (const snapshot of snapshots) {
      const history = this.appendHistory(snapshot);
      const evaluation = evaluateEdgeRisk({
        artifact: this.model,
        deviceId: snapshot.deviceId,
        history,
      });
      this.evaluations.set(snapshot.deviceId, evaluation);
      if (forcePublish || this.shouldPublish(evaluation)) {
        publishTasks.push(this.executePredictionTask(evaluation));
      }
    }
    const results = await Promise.allSettled(publishTasks);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected")
      this.captureRuntimeError("边缘研判发布失败", failure.reason);
    if (publishTasks.length > 0) await this.safePersistState();
  }

  status(): EdgeRiskAgentStatus {
    const devices = Array.from(this.evaluations.values()).sort((left, right) => {
      const riskDelta = levelRank(right.riskLevel) - levelRank(left.riskLevel);
      return riskDelta !== 0 ? riskDelta : right.riskScore - left.riskScore;
    });
    const first = devices[0];
    return {
      mode: "hermes-edge-risk-agent",
      generatedAt: new Date().toISOString(),
      available: this.model !== null && devices.length > 0,
      mqttConnected: this.mqttClient?.connected === true,
      model: {
        loaded: this.model !== null,
        modelKey: this.model?.modelKey ?? null,
        modelVersion: this.model?.modelVersion ?? null,
        trainedAt: this.model?.trainedAt ?? null,
        trainingSource: this.model?.trainingSource ?? null,
        error: this.modelError,
      },
      overallRiskLevel: first?.riskLevel ?? "unavailable",
      maxRiskScore: first?.riskScore ?? null,
      hardRuleTriggered: devices.some((evaluation) => evaluation.hardRuleTriggered),
      devices,
      tasks: this.recentTasks.slice(0, 20),
      pendingUploadCount: this.pendingEvents.length,
      runtimeError: this.runtimeError,
    };
  }

  private appendHistory(snapshot: EdgeTelemetrySnapshot): EdgeTelemetrySnapshot[] {
    const cutoffMs = Date.parse(snapshot.receivedAt) - this.config.riskHistoryWindowMs;
    const history = (this.histories.get(snapshot.deviceId) ?? []).filter(
      (entry) =>
        entry.receivedAt !== snapshot.receivedAt && Date.parse(entry.receivedAt) >= cutoffMs
    );
    history.push(snapshot);
    history.sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt));
    this.histories.set(snapshot.deviceId, history);
    return history;
  }

  private shouldPublish(evaluation: EdgeRiskEvaluation): boolean {
    const previous = this.publishStates.get(evaluation.deviceId);
    if (!previous) return true;
    if (previous.riskLevel !== evaluation.riskLevel) return true;
    if (previous.hardRuleTriggered !== evaluation.hardRuleTriggered) return true;
    return Date.now() - previous.publishedAtMs >= this.config.predictionPublishIntervalMs;
  }

  private predictionEvent(evaluation: EdgeRiskEvaluation): AiPredictionEventV1 {
    const now = new Date();
    return {
      schema_version: 1,
      prediction_id: randomUUID(),
      created_ts: now.toISOString(),
      device_id: evaluation.deviceId,
      station_id: evaluation.stationId,
      model_key: evaluation.modelKey,
      model_version: evaluation.modelVersion,
      horizon_seconds: this.config.predictionHorizonSeconds,
      predicted_ts: new Date(
        now.getTime() + this.config.predictionHorizonSeconds * 1000
      ).toISOString(),
      risk_score: evaluation.riskScore,
      risk_level: toAiPredictionRiskLevel(evaluation.riskLevel),
      explain: evaluation.explain,
      payload: {
        source: "rk3568-hermes-edge-agent",
        riskLevel: evaluation.riskLevel,
        confidence: evaluation.confidence,
        dataStatus: evaluation.dataStatus,
        dataUpdatedAt: evaluation.dataUpdatedAt,
        hardRuleTriggered: evaluation.hardRuleTriggered,
        hardRuleReasons: evaluation.hardRuleReasons,
        factors: evaluation.factors,
        features: evaluation.features,
        executionPolicy: "advisory-first-hard-rules-protected",
      },
    };
  }

  private async executePredictionTask(evaluation: EdgeRiskEvaluation): Promise<void> {
    const task: EdgeAgentTask = {
      taskId: randomUUID(),
      taskKey: "publish_risk_assessment",
      title: "发布边缘风险研判",
      status: "running",
      trigger: evaluation.hardRuleTriggered
        ? "hard-rule-threshold"
        : `risk-${evaluation.riskLevel}`,
      deviceId: evaluation.deviceId,
      createdAt: new Date().toISOString(),
      completedAt: null,
      verification: "等待 MQTT QoS 1 确认",
    };
    this.recordTask(task);
    const event = this.predictionEvent(evaluation);
    const published = await this.publishEvent(event);
    task.status = published ? "completed" : "queued";
    task.completedAt = published ? new Date().toISOString() : null;
    task.verification = published
      ? "MQTT QoS 1 已确认，等待服务器幂等入库"
      : "网络不可用，已进入有限离线队列";
    this.publishStates.set(evaluation.deviceId, {
      publishedAtMs: Date.now(),
      riskLevel: evaluation.riskLevel,
      hardRuleTriggered: evaluation.hardRuleTriggered,
    });
    try {
      await this.appendTaskLog(task);
    } catch (error) {
      this.captureRuntimeError("任务审计日志写入失败", error);
    }
  }

  private publishEvent(event: AiPredictionEventV1): Promise<boolean> {
    const client = this.mqttClient;
    if (!client?.connected) {
      this.queueEvent(event);
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (published: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(published);
      };
      const timer = setTimeout(() => {
        this.queueEvent(event);
        finish(false);
      }, 3000);
      client.publish(
        `${this.config.mqttPredictionTopicPrefix}${event.device_id}`,
        JSON.stringify(event),
        { qos: 1, retain: false },
        (error) => {
          if (error) this.queueEvent(event);
          finish(!error);
        }
      );
    });
  }

  private queueEvent(event: AiPredictionEventV1): void {
    if (this.pendingEvents.some((entry) => entry.prediction_id === event.prediction_id)) return;
    this.pendingEvents.push(event);
    this.pendingEvents = this.pendingEvents.slice(-200);
  }

  private async flushPendingEvents(): Promise<void> {
    const queued = this.pendingEvents.slice();
    this.pendingEvents = [];
    for (let index = 0; index < queued.length; index += 1) {
      const event = queued[index];
      if (!event) continue;
      if (!(await this.publishEvent(event))) {
        for (const remaining of queued.slice(index + 1)) this.queueEvent(remaining);
        break;
      }
    }
    await this.safePersistState();
  }

  private async acceptModel(raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      this.modelError = error instanceof Error ? error.message : String(error);
      return;
    }
    if (!isEdgeRiskModelArtifact(parsed)) {
      this.modelError = "received model failed schema validation";
      return;
    }
    if (!hasValidChecksum(parsed)) {
      this.modelError = "received model checksum validation failed";
      return;
    }
    if (this.model?.modelVersion === parsed.modelVersion) return;
    await writeJsonAtomic(this.config.riskModelPath, parsed);
    this.model = parsed;
    this.modelError = null;
    this.publishStates.clear();
    const task: EdgeAgentTask = {
      taskId: randomUUID(),
      taskKey: "activate_model",
      title: "激活边缘风险模型",
      status: "completed",
      trigger: "retained-model-update",
      deviceId: null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      verification: `${parsed.modelKey}@${parsed.modelVersion} 已校验并原子落盘`,
    };
    this.recordTask(task);
    try {
      await this.appendTaskLog(task);
    } catch (error) {
      this.captureRuntimeError("模型任务日志写入失败", error);
    }
  }

  private async loadModelFromDisk(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.config.riskModelPath, "utf8"));
      if (!isEdgeRiskModelArtifact(parsed)) throw new Error("local model failed schema validation");
      if (!hasValidChecksum(parsed)) throw new Error("local model failed checksum validation");
      this.model = parsed;
      this.modelError = null;
    } catch (error) {
      this.model = null;
      this.modelError = error instanceof Error ? error.message : String(error);
    }
  }

  private recordTask(task: EdgeAgentTask): void {
    const existingIndex = this.recentTasks.findIndex((entry) => entry.taskId === task.taskId);
    if (existingIndex >= 0) this.recentTasks.splice(existingIndex, 1);
    this.recentTasks.unshift(task);
    this.recentTasks = this.recentTasks.slice(0, 50);
  }

  private async appendTaskLog(task: EdgeAgentTask): Promise<void> {
    this.recordTask(task);
    await fs.mkdir(path.dirname(this.config.riskTaskLogPath), { recursive: true });
    await fs.appendFile(this.config.riskTaskLogPath, `${JSON.stringify(task)}\n`, "utf8");
  }

  private async loadPersistedState(): Promise<void> {
    try {
      const parsed = JSON.parse(
        await fs.readFile(this.config.riskStatePath, "utf8")
      ) as Partial<PersistedAgentState>;
      this.pendingEvents = Array.isArray(parsed.pendingEvents)
        ? parsed.pendingEvents.slice(-200)
        : [];
      this.recentTasks = Array.isArray(parsed.recentTasks) ? parsed.recentTasks.slice(0, 50) : [];
    } catch {
      this.pendingEvents = [];
      this.recentTasks = [];
    }
  }

  private async persistState(): Promise<void> {
    const state: PersistedAgentState = {
      schemaVersion: 1,
      pendingEvents: this.pendingEvents,
      recentTasks: this.recentTasks,
    };
    await writeJsonAtomic(this.config.riskStatePath, state);
  }

  private async safePersistState(): Promise<void> {
    try {
      await this.persistState();
    } catch (error) {
      this.captureRuntimeError("边缘状态持久化失败", error);
    }
  }

  private captureRuntimeError(context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.runtimeError = `${context}：${message}`;
  }
}
