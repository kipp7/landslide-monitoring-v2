import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

type RealtimeClient = {
  clientId: string;
  deviceId?: string | undefined;
  subscriptions: string[];
  connectedAtMs: number;
  lastPingMs: number;
  lastDeviceUpdatedAt: string | null;
};

const clients = new Map<string, RealtimeClient>();
const clientStreams = new Map<string, NodeJS.WritableStream>();
const latestData = new Map<string, unknown>();

const uuidSchema = z.string().uuid();

const getRealtimeQuerySchema = z.object({
  deviceId: z.string().optional(),
  device_id: z.string().optional(),
  poll_ms: z.coerce.number().int().min(1000).max(60000).optional(),
  heartbeat_ms: z.coerce.number().int().min(5000).max(60000).optional()
});

const postRealtimeBodySchema = z
  .object({
    action: z.enum([
      "broadcast_device_data",
      "broadcast_anomaly",
      "broadcast_system_status",
      "get_client_stats",
      "cleanup_inactive_clients"
    ]),
    deviceId: z.string().optional(),
    data: z.unknown().optional(),
    options: z.record(z.unknown()).optional()
  })
  .strict();

async function resolveDeviceUuid(pg: PgPool, selector: string): Promise<string | null> {
  const input = selector.trim();
  if (!input) return null;
  if (uuidSchema.safeParse(input).success) return input;

  const row = await withPgClient(pg, async (client) =>
    queryOne<{ device_id: string }>(
      client,
      `
        SELECT device_id
        FROM devices
        WHERE device_id::text = $1
           OR device_name = $1
           OR metadata->>'legacy_device_id' = $1
           OR metadata#>>'{externalIds,legacy}' = $1
           OR metadata->>'huawei_device_id' = $1
           OR metadata#>>'{huawei,deviceId}' = $1
           OR metadata#>>'{externalIds,huawei}' = $1
        LIMIT 1
      `,
      [input]
    )
  );

  return row?.device_id ?? null;
}

function pickBroadcastTarget(parsed: z.infer<typeof postRealtimeBodySchema>): { deviceId: string | null; payload: unknown } {
  const topLevelDeviceId = typeof parsed.deviceId === "string" && parsed.deviceId.trim() ? parsed.deviceId.trim() : null;

  const data = parsed.data;
  if (!data || typeof data !== "object") {
    return { deviceId: topLevelDeviceId, payload: data };
  }

  const record = data as Record<string, unknown>;
  const embeddedDeviceId = typeof record.deviceId === "string" && record.deviceId.trim() ? record.deviceId.trim() : null;
  const embeddedPayload = Object.prototype.hasOwnProperty.call(record, "data") ? record.data : data;

  return { deviceId: embeddedDeviceId ?? topLevelDeviceId, payload: embeddedPayload };
}

function newClientId(): string {
  return `${String(Date.now())}_${randomBytes(6).toString("hex")}`;
}

function writeSse(stream: NodeJS.WritableStream, data: unknown): void {
  stream.write(`data: ${JSON.stringify(data)}\n\n`);
}

function normalizeMetricValue(row: {
  value_f64?: number | null;
  value_i64?: number | null;
  value_str?: string | null;
  value_bool?: number | null;
}): unknown {
  if (row.value_f64 != null) return row.value_f64;
  if (row.value_i64 != null) return row.value_i64;
  if (row.value_bool != null) return row.value_bool === 1;
  if (row.value_str != null) return row.value_str;
  return null;
}

function clickhouseStringToIsoZ(ts: string): string {
  const t = ts.trim();
  if (t.includes("T") && t.endsWith("Z")) return t;
  if (t.includes("T") && !t.endsWith("Z")) return t + "Z";
  if (t.includes(" ")) return t.replace(" ", "T") + "Z";
  return t;
}

async function fetchDeviceState(
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null,
  deviceId: string
): Promise<{ deviceId: string; updatedAt: string; state: unknown }> {
  if (pg) {
    const row = await withPgClient(pg, async (client) =>
      queryOne<{ state: unknown; updated_at: string }>(
        client,
        `
          SELECT
            state,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM device_state
          WHERE device_id = $1
        `,
        [deviceId]
      )
    );
    if (row) {
      return { deviceId, updatedAt: row.updated_at, state: row.state };
    }
  }

  const sql = `
    SELECT
      sensor_key,
      toString(max(received_ts)) AS latest_ts,
      argMax(value_f64, received_ts) AS value_f64,
      argMax(value_i64, received_ts) AS value_i64,
      argMax(value_str, received_ts) AS value_str,
      argMax(value_bool, received_ts) AS value_bool
    FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
    WHERE device_id = {deviceId:String}
    GROUP BY sensor_key
  `;

  const result = await ch.query({
    query: sql,
    query_params: { deviceId },
    format: "JSONEachRow"
  });

  const rows: {
    sensor_key: string;
    latest_ts: string;
    value_f64: number | null;
    value_i64: number | null;
    value_str: string | null;
    value_bool: number | null;
  }[] = await result.json();

  if (rows.length === 0) {
    const err = new Error("not found");
    (err as { statusCode?: number }).statusCode = 404;
    throw err;
  }

  const metrics: Record<string, unknown> = {};
  let updatedAt: string | null = null;

  for (const row of rows) {
    metrics[row.sensor_key] = normalizeMetricValue(row);
    if (!updatedAt || row.latest_ts > updatedAt) updatedAt = row.latest_ts;
  }

  return {
    deviceId,
    updatedAt: clickhouseStringToIsoZ(updatedAt ?? new Date().toISOString()),
    state: { metrics, meta: {} }
  };
}

function broadcastToMatchingClients(predicate: (meta: RealtimeClient) => boolean, payload: unknown): void {
  for (const [clientId, meta] of clients) {
    if (!predicate(meta)) continue;
    const stream = clientStreams.get(clientId);
    if (!stream) continue;
    try {
      writeSse(stream, payload);
    } catch {
      clientStreams.delete(clientId);
      clients.delete(clientId);
    }
  }
}

function broadcastDeviceData(deviceId: string, data: unknown): void {
  latestData.set(deviceId, data);
  const existingAll = latestData.get("all");
  if (typeof existingAll === "object" && existingAll !== null) {
    latestData.set("all", { ...(existingAll as Record<string, unknown>), [deviceId]: data });
  } else {
    latestData.set("all", { [deviceId]: data });
  }

  const payload = {
    type: "device_data",
    deviceId,
    data,
    timestamp: new Date().toISOString(),
    sequence: Date.now()
  };

  broadcastToMatchingClients(
    (meta) =>
      meta.deviceId === deviceId ||
      meta.deviceId === undefined ||
      meta.subscriptions.includes(deviceId) ||
      meta.subscriptions.includes("all"),
    payload
  );
}

function broadcastAnomaly(deviceId: string, anomalyData: unknown): void {
  let severity = "medium";
  if (anomalyData && typeof anomalyData === "object" && "severity" in anomalyData) {
    const s = (anomalyData as Record<string, unknown>).severity;
    if (typeof s === "string") severity = s;
  }

  const payload = {
    type: "anomaly_alert",
    deviceId,
    data: anomalyData,
    severity,
    timestamp: new Date().toISOString(),
    alertId: `alert_${String(Date.now())}`
  };

  broadcastToMatchingClients(() => true, payload);
}

function broadcastSystemStatus(statusData: unknown): void {
  const payload = {
    type: "system_status",
    data: statusData,
    timestamp: new Date().toISOString(),
    connectedDevices: Array.from(latestData.keys()).filter((k) => k !== "all"),
    activeClients: clients.size
  };

  broadcastToMatchingClients(() => true, payload);
}

function getClientStats(): { success: true; stats: unknown; timestamp: string } {
  const now = Date.now();

  const stats = {
    totalClients: clients.size,
    clientDetails: Array.from(clients.values()).map((meta) => ({
      clientId: meta.clientId,
      deviceId: meta.deviceId,
      connectedTime: now - meta.connectedAtMs,
      lastPing: now - meta.lastPingMs,
      subscriptions: meta.subscriptions
    })),
    dataCache: {
      totalDevices: latestData.size,
      devices: Array.from(latestData.keys())
    }
  };

  return { success: true, stats, timestamp: new Date().toISOString() };
}

function cleanupInactiveClients(): number {
  const now = Date.now();
  const inactiveThresholdMs = 2 * 60 * 1000;

  let cleaned = 0;
  for (const [clientId, meta] of clients) {
    if (now - meta.lastPingMs <= inactiveThresholdMs) continue;
    clientStreams.delete(clientId);
    clients.delete(clientId);
    cleaned += 1;
  }
  return cleaned;
}

function registerSseHandler(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null,
  path: string,
  opts: { legacyResponse: boolean }
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get(path, async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;

    const parseQuery = getRealtimeQuerySchema.safeParse(request.query ?? {});
    if (!parseQuery.success) {
      fail(reply, 400, "鍙傛暟閿欒", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    const q = parseQuery.data;
    const deviceSelector = (q.deviceId ?? q.device_id ?? "all").trim() || "all";
    const pollMs = q.poll_ms ?? 5000;
    const heartbeatMs = q.heartbeat_ms ?? 30000;

    let deviceId: string | null = null;
    if (deviceSelector !== "all") {
      const selectorResolved =
        uuidSchema.safeParse(deviceSelector).success
          ? deviceSelector
          : pg
            ? await resolveDeviceUuid(pg, deviceSelector)
            : null;

      const parseId = uuidSchema.safeParse(selectorResolved ?? "");
      if (!parseId.success) {
        fail(reply, 400, "鍙傛暟閿欒", traceId, { field: "deviceId" });
        return;
      }
      deviceId = parseId.data;
    }

    reply.header("Content-Type", "text/event-stream; charset=utf-8");
    reply.header("Cache-Control", "no-cache, no-transform");
    reply.header("Connection", "keep-alive");
    reply.header("X-Accel-Buffering", "no");
    reply.hijack();

    request.raw.setTimeout(0);

    const stream = reply.raw;
    const clientId = newClientId();
    const meta: RealtimeClient = {
      clientId,
      deviceId: deviceId ?? undefined,
      subscriptions: [deviceSelector],
      connectedAtMs: Date.now(),
      lastPingMs: Date.now(),
      lastDeviceUpdatedAt: null
    };

    clients.set(clientId, meta);
    clientStreams.set(clientId, stream);

    const cleanup = () => {
      clientStreams.delete(clientId);
      clients.delete(clientId);
    };

    stream.on("close", cleanup);
    stream.on("error", cleanup);
    request.raw.on("close", cleanup);

    writeSse(stream, {
      type: "connection",
      clientId,
      timestamp: new Date().toISOString(),
      message: "realtime stream connected",
      traceId
    });

    if (deviceId) {
      try {
        const state = await fetchDeviceState(config, ch, pg, deviceId);
        meta.lastDeviceUpdatedAt = state.updatedAt;
        latestData.set(deviceId, state);
        writeSse(stream, { type: "initial_data", deviceId, data: state, timestamp: new Date().toISOString() });
      } catch (err) {
        const status = typeof (err as { statusCode?: unknown }).statusCode === "number" ? (err as { statusCode: number }).statusCode : 500;
        if (opts.legacyResponse) {
          writeSse(stream, { type: "error", timestamp: new Date().toISOString(), message: "initial_data failed", status });
        } else {
          writeSse(stream, { type: "error", timestamp: new Date().toISOString(), message: "initial_data failed", status, traceId });
        }
      }
    } else if (deviceSelector === "all" && latestData.has("all")) {
      writeSse(stream, { type: "initial_data", deviceId: "all", data: latestData.get("all"), timestamp: new Date().toISOString() });
    }

    const heartbeat = setInterval(() => {
      meta.lastPingMs = Date.now();
      try {
        writeSse(stream, {
          type: "heartbeat",
          timestamp: new Date().toISOString(),
          connectedClients: clients.size
        });
      } catch {
        clearInterval(heartbeat);
        cleanup();
      }
    }, heartbeatMs);

    const shouldPoll = deviceId !== null && pollMs > 0;
    const poller = shouldPoll
      ? setInterval(async () => {
          if (!deviceId) return;
          try {
            const state = await fetchDeviceState(config, ch, pg, deviceId);
            if (meta.lastDeviceUpdatedAt && state.updatedAt <= meta.lastDeviceUpdatedAt) return;
            meta.lastDeviceUpdatedAt = state.updatedAt;
            latestData.set(deviceId, state);
            writeSse(stream, {
              type: "device_data",
              deviceId,
              data: state,
              timestamp: new Date().toISOString(),
              sequence: Date.now()
            });
          } catch {
            // swallow: realtime stream should not tear down on transient failures
          }
        }, pollMs)
      : null;

    const stopTimers = () => {
      clearInterval(heartbeat);
      if (poller) clearInterval(poller);
    };

    stream.on("close", stopTimers);
    stream.on("error", stopTimers);
    request.raw.on("close", stopTimers);
  });

  app.post(path, async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;

    const parseBody = postRealtimeBodySchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "鍙傛暟閿欒", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const { action, data } = parseBody.data;
    const target = pickBroadcastTarget(parseBody.data);
    let deviceId = target.deviceId;

    if ((action === "broadcast_device_data" || action === "broadcast_anomaly") && deviceId && !uuidSchema.safeParse(deviceId).success) {
      if (pg) deviceId = (await resolveDeviceUuid(pg, deviceId)) ?? deviceId;
    }

    if (action === "get_client_stats") {
      const stats = getClientStats();
      if (opts.legacyResponse) {
        void reply.code(200).send(stats);
      } else {
        ok(reply, stats.stats, traceId);
      }
      return;
    }

    if (action === "cleanup_inactive_clients") {
      const cleaned = cleanupInactiveClients();
      const payload = { cleanedClients: cleaned, activeClients: clients.size };
      if (opts.legacyResponse) {
        void reply.code(200).send({ success: true, ...payload, timestamp: new Date().toISOString() });
      } else {
        ok(reply, payload, traceId);
      }
      return;
    }

    if ((action === "broadcast_device_data" || action === "broadcast_anomaly") && (!deviceId || !uuidSchema.safeParse(deviceId).success)) {
      if (opts.legacyResponse) {
        void reply.code(400).send({ success: false, error: "invalid deviceId" });
      } else {
        fail(reply, 400, "鍙傛暟閿欒", traceId, { field: "deviceId" });
      }
      return;
    }

    if (action === "broadcast_device_data") {
      const ensuredDeviceId = deviceId;
      if (!ensuredDeviceId) {
        fail(reply, 400, "鍙傛暟閿欒", traceId, { field: "deviceId" });
        return;
      }
      broadcastDeviceData(ensuredDeviceId, target.payload);
    } else if (action === "broadcast_anomaly") {
      const ensuredDeviceId = deviceId;
      if (!ensuredDeviceId) {
        fail(reply, 400, "鍙傛暟閿欒", traceId, { field: "deviceId" });
        return;
      }
      broadcastAnomaly(ensuredDeviceId, target.payload);
    } else {
      broadcastSystemStatus(data);
    }

    const result = { action, timestamp: new Date().toISOString(), activeClients: clients.size };
    if (opts.legacyResponse) {
      void reply.code(200).send({ success: true, ...result });
    } else {
      ok(reply, result, traceId);
    }
  });
}

export function registerRealtimeRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  registerSseHandler(app, config, ch, pg, "/realtime/stream", { legacyResponse: false });
}

export function registerRealtimeLegacyCompatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  registerSseHandler(app, config, ch, pg, "/realtime-stream", { legacyResponse: true });
}
