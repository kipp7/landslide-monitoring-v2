import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AdminAuthConfig } from "../authz";
import { requirePermission } from "../authz";
import type { AppConfig } from "../config";
import type { PgPool } from "../postgres";

type InjectResult = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  payload: string;
};

type TelemetryRow = {
  device_id: string;
  sensor_key: string;
  received_ts: string;
  value_f64: number | null;
  value_i64: number | null;
  value_str: string | null;
  value_bool: boolean | null;
};

function safeJsonParse(payload: string): unknown {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

function clickhouseStringToIsoZ(ts: string): string {
  const t = ts.trim();
  if (t.includes("T") && t.endsWith("Z")) return t;
  if (t.includes("T") && !t.endsWith("Z")) return t + "Z";
  if (t.includes(" ")) return t.replace(" ", "T") + "Z";
  return t;
}

function normalizeTelemetryValue(row: TelemetryRow): unknown {
  if (typeof row.value_f64 === "number" && Number.isFinite(row.value_f64)) return row.value_f64;
  if (typeof row.value_i64 === "number" && Number.isFinite(row.value_i64)) return row.value_i64;
  if (typeof row.value_bool === "boolean") return row.value_bool;
  if (typeof row.value_str === "string") return row.value_str;
  return null;
}

function forwardAuthHeader(request: FastifyRequest): Record<string, string> {
  const auth = request.headers.authorization;
  if (!auth || typeof auth !== "string") return {};
  return { authorization: auth };
}

type InjectMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

async function injectJson(app: FastifyInstance, opts: { method: InjectMethod; url: string; headers?: Record<string, string> }) {
  const res = (await app.inject({
    method: opts.method,
    url: opts.url,
    headers: opts.headers ?? {}
  })) as unknown as InjectResult;

  const parsed = safeJsonParse(res.payload);
  return { res, parsed };
}

function replyFromInject(reply: FastifyReply, injected: InjectResult): void {
  void reply.code(injected.statusCode);
  const contentType = injected.headers["content-type"];
  if (typeof contentType === "string") reply.type(contentType);
  void reply.send(injected.payload);
}

export function registerIotServerCompatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null,
  opts?: { injector?: FastifyInstance }
): void {
  const injector = opts?.injector ?? app;
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/info", async (_request, reply) => {
    const version = process.env.IOT_SERVER_COMPAT_VERSION ?? process.env.npm_package_version ?? "0.0.0";

    void reply.code(200).send({
      name: "Landslide IoT Service",
      version,
      description: "滑坡监测IoT数据接收服务（api-service 兼容层）",
      service: "api-service",
      ok: true,
      endpoints: {
        health: "GET /health",
        info: "GET /info",
        device_list: "GET /devices/list",
        device_mappings: "GET /devices/mappings",
        device_info: "GET /devices/info/:simpleId",
        device_by_id: "GET /devices/:deviceId",
        device_management: "GET /devices/:deviceId/management",
        device_status: "GET /devices/:deviceId/status",
        latest_data: "GET /debug/latest-data",
        legacy_api_prefix: "/api/* (v2 legacy-compat)",
        legacy_iot_api_prefix: "/iot/api/* (v2 legacy-compat)",
        legacy_prefix: "GET /api/iot/devices/* (preferred in v2 legacy-compat)"
      },
      timestamp: new Date().toISOString()
    });
  });

  app.get("/devices/mappings", async (request, reply) => {
    const { res, parsed } = await injectJson(injector, {
      method: "GET",
      url: "/api/iot/devices/mappings",
      headers: forwardAuthHeader(request)
    });

    if (res.statusCode !== 200 || !parsed || typeof parsed !== "object") {
      replyFromInject(reply, res);
      return;
    }

    const obj = parsed as { success?: unknown; data?: unknown; message?: unknown; timestamp?: unknown };
    const data = Array.isArray(obj.data) ? obj.data : [];

    void reply.code(200).send({
      success: Boolean(obj.success),
      data,
      count: data.length,
      message: typeof obj.message === "string" ? obj.message : "ok",
      timestamp: typeof obj.timestamp === "string" ? obj.timestamp : new Date().toISOString()
    });
  });

  app.get("/devices/:deviceId", async (request, reply) => {
    const rawId = typeof (request.params as { deviceId?: unknown }).deviceId === "string" ? (request.params as { deviceId: string }).deviceId : "";
    const deviceId = rawId.trim();
    if (!deviceId) {
      void reply.code(400).send({ success: false, error: "invalid deviceId" });
      return;
    }

    const { res, parsed } = await injectJson(injector, {
      method: "GET",
      url: `/api/iot/devices/${encodeURIComponent(deviceId)}`,
      headers: forwardAuthHeader(request)
    });

    if (res.statusCode !== 200 || !parsed || typeof parsed !== "object") {
      replyFromInject(reply, res);
      return;
    }

    const obj = parsed as { success?: unknown; data?: unknown; message?: unknown; timestamp?: unknown };
    void reply.code(200).send({
      success: Boolean(obj.success),
      data: obj.data ?? null,
      count: obj.data ? 1 : 0,
      message: typeof obj.message === "string" ? obj.message : "ok",
      timestamp: typeof obj.timestamp === "string" ? obj.timestamp : new Date().toISOString()
    });
  });

  app.get("/devices/list", async (request, reply) => {
    const { res, parsed } = await injectJson(injector, {
      method: "GET",
      url: "/api/iot/devices/mappings",
      headers: forwardAuthHeader(request)
    });

    if (res.statusCode !== 200 || !parsed || typeof parsed !== "object") {
      replyFromInject(reply, res);
      return;
    }

    const obj = parsed as { success?: unknown; data?: unknown };
    const mappings = Array.isArray(obj.data) ? (obj.data as unknown[]) : [];

    const data = mappings
      .map((m) => (m && typeof m === "object" ? (m as Record<string, unknown>) : null))
      .filter((m): m is Record<string, unknown> => Boolean(m))
      .map((m) => {
        const simpleId = typeof m.simple_id === "string" ? m.simple_id : "";
        const deviceName = typeof m.device_name === "string" ? m.device_name : simpleId;
        const lastDataTime = typeof m.last_data_time === "string" ? m.last_data_time : null;
        const online = typeof m.online_status === "string" ? m.online_status : "offline";
        const status = online === "online" ? "online" : "offline";

        return {
          device_id: simpleId,
          friendly_name: deviceName,
          display_name: deviceName,
          location_name: typeof m.location_name === "string" ? m.location_name : "",
          device_type: typeof m.device_type === "string" ? m.device_type : "unknown",
          status,
          last_active: lastDataTime
        };
      });

    void reply.code(200).send({ success: Boolean(obj.success), data, count: data.length });
  });

  app.get("/devices/info/:simpleId", async (request, reply) => {
    const rawId = typeof (request.params as { simpleId?: unknown }).simpleId === "string" ? (request.params as { simpleId: string }).simpleId : "";
    const simpleId = rawId.trim();
    if (!simpleId) {
      void reply.code(400).send({ success: false, error: "invalid simpleId" });
      return;
    }

    const { res, parsed } = await injectJson(injector, {
      method: "GET",
      url: "/api/iot/devices/mappings",
      headers: forwardAuthHeader(request)
    });

    if (res.statusCode != 200 || !parsed || typeof parsed !== "object") {
      replyFromInject(reply, res);
      return;
    }

    const obj = parsed as { success?: unknown; data?: unknown };
    const mappings = Array.isArray(obj.data) ? (obj.data as unknown[]) : [];

    const found = mappings
      .map((m) => (m && typeof m === "object" ? (m as Record<string, unknown>) : null))
      .find((m) => typeof m?.simple_id === "string" && m.simple_id === simpleId);

    if (!found) {
      void reply.code(404).send({ success: false, error: "device not found" });
      return;
    }

    void reply.code(200).send({
      success: Boolean(obj.success),
      data: {
        simple_id: simpleId,
        actual_device_id: found.actual_device_id ?? null,
        device_name: found.device_name ?? simpleId,
        location: {
          location_name: found.location_name ?? "",
          latitude: found.latitude ?? null,
          longitude: found.longitude ?? null,
          device_type: found.device_type ?? null
        }
      }
    });
  });

  app.get("/devices/:deviceId/management", async (request, reply) => {
    const rawId =
      typeof (request.params as { deviceId?: unknown }).deviceId === "string" ? (request.params as { deviceId: string }).deviceId : "";
    const deviceId = rawId.trim();
    if (!deviceId) {
      void reply.code(400).send({ success: false, error: "invalid deviceId" });
      return;
    }

    const { res, parsed } = await injectJson(injector, {
      method: "GET",
      url: `/api/device-management?device_id=${encodeURIComponent(deviceId)}`,
      headers: forwardAuthHeader(request)
    });

    if (res.statusCode !== 200 || !parsed || typeof parsed !== "object") {
      replyFromInject(reply, res);
      return;
    }

    const obj = parsed as { success?: unknown; data?: unknown; timestamp?: unknown };
    const data = obj.data && typeof obj.data === "object" ? obj.data : null;

    let deformationData: Record<string, unknown> | null = null;
    try {
      const { res: defRes, parsed: defParsed } = await injectJson(injector, {
        method: "GET",
        url: `/api/device-management/deformation/${encodeURIComponent(deviceId)}/summary`,
        headers: forwardAuthHeader(request)
      });

      if (defRes.statusCode === 200 && defParsed && typeof defParsed === "object") {
        const def = defParsed as {
          hasBaseline?: unknown;
          max_displacement?: unknown;
          horizontal_displacement?: unknown;
          vertical_displacement?: unknown;
          velocity?: unknown;
          risk_level?: unknown;
          deformation_type?: unknown;
          confidence?: unknown;
        };

        deformationData = {
          latitude: null,
          longitude: null,
          deformation_distance_3d: def.max_displacement ?? null,
          deformation_horizontal: def.horizontal_displacement ?? null,
          deformation_vertical: def.vertical_displacement ?? null,
          deformation_velocity: def.velocity ?? null,
          deformation_risk_level: def.risk_level ?? null,
          deformation_type: def.deformation_type ?? null,
          deformation_confidence: def.confidence ?? null,
          baseline_established: typeof def.hasBaseline === "boolean" ? def.hasBaseline : null
        };
      }
    } catch {
      deformationData = null;
    }

    void reply.code(200).send({
      success: Boolean(obj.success),
      data,
      deformation_data: deformationData,
      timestamp: typeof obj.timestamp === "string" ? obj.timestamp : new Date().toISOString()
    });
  });

  app.get("/devices/:deviceId/status", async (request, reply) => {
    const rawId =
      typeof (request.params as { deviceId?: unknown }).deviceId === "string" ? (request.params as { deviceId: string }).deviceId : "";
    const deviceId = rawId.trim();
    if (!deviceId) {
      void reply.code(400).send({ success: false, error: "invalid deviceId" });
      return;
    }

    const { res, parsed } = await injectJson(injector, {
      method: "GET",
      url: `/api/device-management?device_id=${encodeURIComponent(deviceId)}`,
      headers: forwardAuthHeader(request)
    });

    if (res.statusCode !== 200 || !parsed || typeof parsed !== "object") {
      replyFromInject(reply, res);
      return;
    }

    const obj = parsed as { success?: unknown; data?: unknown; timestamp?: unknown };
    const data = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : {};

    void reply.code(200).send({
      success: Boolean(obj.success),
      data: {
        device_id: deviceId,
        status: data.status ?? "offline",
        health_score: data.health_score ?? 0,
        battery_level: data.battery_level ?? 0,
        last_update: data.last_data_time ?? (typeof obj.timestamp === "string" ? obj.timestamp : new Date().toISOString()),
        current_data: {
          temperature: data.temperature ?? null,
          humidity: data.humidity ?? null,
          vibration: null,
          risk_level: data.deformation_risk_level ?? null,
          alarm_active: null,
          uptime: null
        },
        today_stats: { count: data.data_count_today ?? 0 },
        weekly_trend: []
      }
    });
  });

  app.get("/debug/latest-data", async (_request, reply) => {
    if (!(await requirePermission(adminCfg, pg, _request, reply, "data:view"))) return;

    const now = new Date();

    const sql = `
      SELECT
        device_id,
        sensor_key,
        toString(received_ts) AS received_ts,
        value_f64,
        value_i64,
        value_str,
        value_bool
      FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
      ORDER BY received_ts DESC
      LIMIT 10
    `;

    const result = await ch.query({ query: sql, format: "JSONEachRow" });
    const rows: TelemetryRow[] = await result.json();

    const data = rows.map((r) => {
      const iso = clickhouseStringToIsoZ(r.received_ts);
      const parsed = Date.parse(iso);
      const ageSeconds = Number.isFinite(parsed) ? Math.round((now.getTime() - parsed) / 1000) : null;
      return {
        device_id: r.device_id,
        sensor_key: r.sensor_key,
        received_ts: iso,
        value: normalizeTelemetryValue(r),
        data_age_seconds: ageSeconds
      };
    });

    void reply.code(200).send({
      success: true,
      data,
      total_records: data.length,
      query_time: now.toISOString(),
      device_filter: "all"
    });
  });

  app.get("/debug/latest-data/:deviceId", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;

    const rawId =
      typeof (request.params as { deviceId?: unknown }).deviceId === "string" ? (request.params as { deviceId: string }).deviceId : "";
    const deviceId = rawId.trim();
    if (!deviceId) {
      void reply.code(400).send({ success: false, error: "invalid deviceId" });
      return;
    }

    const now = new Date();

    const sql = `
      SELECT
        device_id,
        sensor_key,
        toString(received_ts) AS received_ts,
        value_f64,
        value_i64,
        value_str,
        value_bool
      FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
      WHERE device_id = {deviceId:String}
      ORDER BY received_ts DESC
      LIMIT 10
    `;

    const result = await ch.query({ query: sql, query_params: { deviceId }, format: "JSONEachRow" });
    const rows: TelemetryRow[] = await result.json();

    const data = rows.map((r) => {
      const iso = clickhouseStringToIsoZ(r.received_ts);
      const parsed = Date.parse(iso);
      const ageSeconds = Number.isFinite(parsed) ? Math.round((now.getTime() - parsed) / 1000) : null;
      return {
        device_id: r.device_id,
        sensor_key: r.sensor_key,
        received_ts: iso,
        value: normalizeTelemetryValue(r),
        data_age_seconds: ageSeconds
      };
    });

    void reply.code(200).send({
      success: true,
      data,
      total_records: data.length,
      query_time: now.toISOString(),
      device_filter: deviceId
    });
  });
}
