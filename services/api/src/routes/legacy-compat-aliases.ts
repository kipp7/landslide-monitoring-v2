import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { InjectOptions } from "light-my-request";

type InjectResult = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

function toHeaders(request: FastifyRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(request.headers)) {
    if (v === undefined) continue;
    headers[k] = Array.isArray(v) ? v.join(",") : typeof v === "string" ? v : String(v);
  }
  return headers;
}

function toQueryString(query: unknown): string {
  if (!query || typeof query !== "object") return "";
  const params = new URLSearchParams();

  const toParam = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
    if (value instanceof Date) return value.toISOString();
    return null;
  };

  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        const pv = toParam(v);
        if (pv === null) continue;
        params.append(key, pv);
      }
      continue;
    }
    const pv = toParam(value);
    if (pv === null) continue;
    params.append(key, pv);
  }

  const s = params.toString();
  return s ? `?${s}` : "";
}

async function proxyInject(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  method: "GET" | "POST" | "PUT",
  url: string
): Promise<void> {
  const injectOpts: InjectOptions = { method, url, headers: toHeaders(request) };
  if (method !== "GET") {
    injectOpts.payload = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});
  }

  const res = (await app.inject(injectOpts)) as unknown as InjectResult;
  const contentType = res.headers["content-type"];
  const contentTypeValue = Array.isArray(contentType) ? contentType.join(",") : contentType;
  if (contentTypeValue) reply.header("content-type", contentTypeValue);
  void reply.code(res.statusCode).send(res.body);
}

export function registerLegacyCompatAliasRoutes(app: FastifyInstance): void {
  app.get("/device-management-optimized", async (request, reply) => {
    await proxyInject(app, request, reply, "GET", `/device-management${toQueryString(request.query)}`);
  });

  app.post("/device-management-optimized", async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "cache_clear") {
      void reply.code(200).send({ success: true, action: "cache_clear", message: "cache cleared", timestamp: new Date().toISOString() });
      return;
    }

    if (action !== "health_check") {
      void reply.code(400).send({ success: false, error: "unsupported action", timestamp: new Date().toISOString() });
      return;
    }

    const devices = Array.isArray(body?.devices)
      ? (body.devices as unknown[])
          .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
          .map((d) => d.trim())
      : [];

    const headers = toHeaders(request);
    const results = await Promise.all(
      devices.map(async (deviceId) => {
        try {
          const res = (await app.inject({
            method: "GET",
            url: `/iot/devices/${encodeURIComponent(deviceId)}`,
            headers
          })) as unknown as InjectResult;
          if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(`status ${String(res.statusCode)}`);

          const parsed = JSON.parse(res.body) as { success?: unknown; data?: unknown };
          const data = parsed.success === true && parsed.data && typeof parsed.data === "object" ? (parsed.data as Record<string, unknown>) : null;
          const onlineStatus = data?.online_status;
          const lastSeen = typeof data?.last_data_time === "string" ? data.last_data_time : null;
          const isOnline = onlineStatus === "online";

          return {
            device_id: deviceId,
            status: isOnline ? "online" : "offline",
            last_seen: lastSeen,
            health_score: isOnline ? 85 : 0
          };
        } catch {
          return { device_id: deviceId, status: "offline", last_seen: null, health_score: 0 };
        }
      })
    );

    void reply
      .code(200)
      .send({ success: true, action: "health_check", results, timestamp: new Date().toISOString() });
  });

  app.get("/device-management-real", async (request, reply) => {
    await proxyInject(app, request, reply, "GET", `/device-management/hierarchical${toQueryString(request.query)}`);
  });

  app.get("/device-management-real-db", async (request, reply) => {
    await proxyInject(app, request, reply, "GET", `/device-management/hierarchical${toQueryString(request.query)}`);
  });

  app.post("/device-management-real/diagnostics", async (request, reply) => {
    await proxyInject(app, request, reply, "POST", "/device-management/diagnostics");
  });

  app.get("/monitoring-stations-optimized", async (request, reply) => {
    await proxyInject(app, request, reply, "GET", `/monitoring-stations${toQueryString(request.query)}`);
  });

  app.put("/monitoring-stations-optimized", async (request, reply) => {
    await proxyInject(app, request, reply, "PUT", "/monitoring-stations");
  });
}
