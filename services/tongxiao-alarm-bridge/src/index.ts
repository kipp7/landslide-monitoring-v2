import { createLogger } from "@lsmv2/observability";
import dotenv from "dotenv";
import http from "node:http";
import path from "node:path";
import mqtt from "mqtt";
import { ZodError } from "zod";
import { loadConfigFromEnv } from "./config";
import {
  alarmDesiredStateSchema,
  alarmReportedStateSchema,
  createDesiredState,
  parseActionContext,
  presenceEventSchema,
  RevisionClock,
  type AlarmAction,
  type AlarmDesiredState,
  type AlarmReportedState,
  type PresenceEvent
} from "./contract";

const MAX_BODY_BYTES = 32 * 1024;

function sendJson(res: http.ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += value.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(value);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function main(): void {
  dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });
  const config = loadConfigFromEnv(process.env);
  const logger = createLogger(config.serviceName);
  const desiredTopic = `${config.mqttDesiredPrefix}${config.deviceId}`;
  const reportedTopic = `${config.mqttReportedPrefix}${config.deviceId}`;
  const presenceTopic = `${config.mqttPresencePrefix}${config.deviceId}`;
  const revisionClock = new RevisionClock();

  let mqttConnected = false;
  let desired: AlarmDesiredState | null = null;
  let reported: AlarmReportedState | null = null;
  let presence: PresenceEvent | null = null;
  let lastAction: AlarmAction | null = null;
  let lastActionAt: string | null = null;
  let lastError: string | null = null;
  let actionQueue: Promise<unknown> = Promise.resolve();

  const client = mqtt.connect(config.mqttUrl, {
    clientId: `${config.serviceName}-${String(process.pid)}`,
    clean: true,
    reconnectPeriod: 2000,
    ...(config.mqttUsername ? { username: config.mqttUsername } : {}),
    ...(config.mqttPassword ? { password: config.mqttPassword } : {})
  });

  client.on("connect", () => {
    mqttConnected = true;
    lastError = null;
    client.subscribe([desiredTopic, reportedTopic, presenceTopic], { qos: 1 }, (err) => {
      if (err) {
        lastError = err.message;
        logger.error({ err }, "mqtt subscribe failed");
        return;
      }
      logger.info({ desiredTopic, reportedTopic, presenceTopic }, "mqtt connected and subscribed");
    });
  });
  client.on("close", () => {
    mqttConnected = false;
  });
  client.on("offline", () => {
    mqttConnected = false;
  });
  client.on("error", (err) => {
    lastError = err.message;
    logger.warn({ err }, "mqtt error");
  });
  client.on("message", (topic, payload) => {
    try {
      const parsed = JSON.parse(payload.toString("utf8")) as unknown;
      if (topic === desiredTopic) {
        const next = alarmDesiredStateSchema.parse(parsed);
        if (next.device_id !== config.deviceId) return;
        if (desired !== null && next.revision < desired.revision) {
          logger.warn(
            { receivedRevision: next.revision, currentRevision: desired.revision },
            "stale alarm desired state ignored"
          );
          return;
        }
        revisionClock.observe(next.revision);
        desired = next;
      } else if (topic === reportedTopic) {
        const next = alarmReportedStateSchema.parse(parsed);
        if (next.device_id !== config.deviceId) return;
        if (reported !== null && next.applied_revision < reported.applied_revision) {
          logger.warn(
            { receivedRevision: next.applied_revision, currentRevision: reported.applied_revision },
            "stale alarm reported state ignored"
          );
          return;
        }
        reported = next;
      } else if (topic === presenceTopic) {
        const next = presenceEventSchema.parse(parsed);
        if (next.device_id === config.deviceId) presence = next;
      }
    } catch (err) {
      logger.warn({ err, topic }, "invalid alarm terminal mqtt payload ignored");
    }
  });

  const publishDesired = (next: AlarmDesiredState): Promise<void> =>
    new Promise((resolve, reject) => {
      client.publish(desiredTopic, JSON.stringify(next), { qos: 1, retain: true }, (err: unknown) => {
        if (err) reject(err instanceof Error ? err : new Error("mqtt publish failed"));
        else resolve();
      });
    });

  const statusPayload = () => {
    const boardOnline = mqttConnected && presence?.status === "online";
    const inSync = desired !== null && reported?.applied_revision === desired.revision;
    return {
      available: mqttConnected,
      state: reported?.state ?? desired?.state ?? "idle",
      lastAction,
      lastActionAt,
      lastError,
      detail: `Tongxiao ${config.deviceId} via ${config.mqttUrl}`,
      tongxiao: {
        deviceId: config.deviceId,
        mqttConnected,
        boardOnline,
        inSync,
        desired,
        reported,
        presence,
        voiceEnabled: config.voiceEnabled
      }
    };
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/status")) {
        sendJson(res, 200, statusPayload());
        return;
      }

      const action = url.pathname.replace(/^\/+/, "") as AlarmAction;
      if (req.method !== "POST" || !["alarm_on", "alarm_off", "silence"].includes(action)) {
        sendJson(res, 404, { message: "not found" });
        return;
      }
      if (!mqttConnected) {
        sendJson(res, 503, { ...statusPayload(), message: "mqtt broker is not connected" });
        return;
      }

      const context = parseActionContext(await readJsonBody(req));
      actionQueue = actionQueue.catch(() => undefined).then(async () => {
        const next = createDesiredState({
          action,
          context,
          deviceId: config.deviceId,
          revision: revisionClock.next(),
          voiceEnabled: config.voiceEnabled,
          previous: desired
        });
        await publishDesired(next);
        desired = next;
        lastAction = action;
        lastActionAt = next.issued_ts;
        lastError = null;
        logger.info(
          { action, revision: next.revision, state: next.state, severity: next.severity },
          "alarm desired state published"
        );
      });
      await actionQueue;
      sendJson(res, 200, statusPayload());
    })().catch((err: unknown) => {
      lastError = err instanceof Error ? err.message : String(err);
      const clientError = err instanceof SyntaxError || err instanceof ZodError || lastError === "request body too large";
      logger.warn({ err }, "alarm bridge request failed");
      sendJson(res, clientError ? 400 : 500, { ...statusPayload(), message: lastError });
    });
  });

  server.listen(config.port, config.host, () => {
    logger.info(
      { host: config.host, port: config.port, deviceId: config.deviceId, voiceEnabled: config.voiceEnabled },
      "tongxiao alarm bridge started"
    );
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(() => client.end(false, () => process.exit(0)));
  };
  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
}

main();
