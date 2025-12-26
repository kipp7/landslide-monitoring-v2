import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

type InjectResult = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  payload: string;
};

function safeJsonParse(payload: string): unknown {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
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

export function registerIotServerCompatRoutes(app: FastifyInstance): void {
  app.get("/info", async (_request, reply) => {
    void reply.code(200).send({
      service: "api-service",
      ok: true,
      endpoints: {
        health: "GET /health",
        device_list: "GET /devices/list",
        device_mappings: "GET /devices/mappings",
        device_info: "GET /devices/info/:simpleId",
        device_by_id: "GET /devices/:deviceId",
        legacy_prefix: "GET /api/iot/devices/* (preferred in v2 legacy-compat)"
      },
      timestamp: new Date().toISOString()
    });
  });

  app.get("/devices/mappings", async (request, reply) => {
    const { res, parsed } = await injectJson(app, {
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

    const { res, parsed } = await injectJson(app, {
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
    const { res, parsed } = await injectJson(app, {
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

    const { res, parsed } = await injectJson(app, {
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

    const { res, parsed } = await injectJson(app, {
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
      const { res: defRes, parsed: defParsed } = await injectJson(app, {
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

    const { res, parsed } = await injectJson(app, {
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
    void reply.code(501).send({
      success: false,
      disabled: true,
      message: "v2 does not expose legacy iot_data raw rows; use v2 /api/v1/data/* instead",
      timestamp: new Date().toISOString()
    });
  });

  app.get("/debug/latest-data/:deviceId", async (_request, reply) => {
    void reply.code(501).send({
      success: false,
      disabled: true,
      message: "v2 does not expose legacy iot_data raw rows; use v2 /api/v1/data/* instead",
      timestamp: new Date().toISOString()
    });
  });
}
