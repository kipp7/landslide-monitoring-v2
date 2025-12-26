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

  // Additional compat: some deployments use NEXT_PUBLIC_IOT_API_BASE=/iot/api and then call `/devices/*` under that base.
  app.get("/iot/api/info", async (request, reply) => {
    const res = (await app.inject({ method: "GET", url: "/info", headers: forwardAuthHeader(request) })) as unknown as InjectResult;
    replyFromInject(reply, res);
  });

  app.get("/iot/api/devices/mappings", async (request, reply) => {
    const res = (await app.inject({
      method: "GET",
      url: "/devices/mappings",
      headers: forwardAuthHeader(request)
    })) as unknown as InjectResult;
    replyFromInject(reply, res);
  });

  app.get("/iot/api/devices/list", async (request, reply) => {
    const res = (await app.inject({ method: "GET", url: "/devices/list", headers: forwardAuthHeader(request) })) as unknown as InjectResult;
    replyFromInject(reply, res);
  });

  app.get("/iot/api/devices/info/:simpleId", async (request, reply) => {
    const rawId =
      typeof (request.params as { simpleId?: unknown }).simpleId === "string" ? (request.params as { simpleId: string }).simpleId : "";
    const simpleId = rawId.trim();
    if (!simpleId) {
      void reply.code(400).send({ success: false, error: "invalid simpleId" });
      return;
    }

    const res = (await app.inject({
      method: "GET",
      url: `/devices/info/${encodeURIComponent(simpleId)}`,
      headers: forwardAuthHeader(request)
    })) as unknown as InjectResult;
    replyFromInject(reply, res);
  });

  app.get("/iot/api/devices/:deviceId", async (request, reply) => {
    const rawId =
      typeof (request.params as { deviceId?: unknown }).deviceId === "string" ? (request.params as { deviceId: string }).deviceId : "";
    const deviceId = rawId.trim();
    if (!deviceId) {
      void reply.code(400).send({ success: false, error: "invalid deviceId" });
      return;
    }

    const res = (await app.inject({
      method: "GET",
      url: `/devices/${encodeURIComponent(deviceId)}`,
      headers: forwardAuthHeader(request)
    })) as unknown as InjectResult;
    replyFromInject(reply, res);
  });
}
