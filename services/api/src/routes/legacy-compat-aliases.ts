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

async function proxyInjectResult(
  app: FastifyInstance,
  request: FastifyRequest,
  method: "GET" | "POST" | "PUT",
  url: string
): Promise<InjectResult> {
  const injectOpts: InjectOptions = { method, url, headers: toHeaders(request) };
  if (method !== "GET") {
    injectOpts.payload = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});
  }
  return (await app.inject(injectOpts)) as unknown as InjectResult;
}

export function registerLegacyCompatAliasRoutes(app: FastifyInstance): void {
  app.get("/device-management-optimized", async (request, reply) => {
    await proxyInject(app, request, reply, "GET", `/device-management${toQueryString(request.query)}`);
  });

  app.get("/device-management-real", async (request, reply) => {
    await proxyInject(app, request, reply, "GET", `/device-management/hierarchical${toQueryString(request.query)}`);
  });

  app.get("/device-management-real-db", async (request, reply) => {
    const q = (request.query ?? {}) as { mode?: unknown; device_id?: unknown; deviceId?: unknown };
    const mode = typeof q.mode === "string" ? q.mode.trim() : "";
    const deviceId =
      typeof q.device_id === "string" ? q.device_id.trim() : typeof q.deviceId === "string" ? q.deviceId.trim() : "";

    const res = await proxyInjectResult(app, request, "GET", `/device-management/hierarchical${toQueryString(request.query)}`);
    const contentType = res.headers["content-type"];
    const contentTypeValue = Array.isArray(contentType) ? contentType.join(",") : contentType;
    if (contentTypeValue) reply.header("content-type", contentTypeValue);

    if (res.statusCode < 200 || res.statusCode >= 300) {
      void reply.code(res.statusCode).send(res.body);
      return;
    }

    if (!mode || mode === "all") {
      void reply.code(res.statusCode).send(res.body);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      void reply.code(res.statusCode).send(res.body);
      return;
    }

    const envelope = parsed as { success?: unknown; data?: unknown };
    if (envelope.success !== true || !envelope.data || typeof envelope.data !== "object") {
      void reply.code(res.statusCode).send(res.body);
      return;
    }

    const data = envelope.data as { allDevices?: unknown };
    const allDevices: unknown[] = Array.isArray(data.allDevices) ? (data.allDevices as unknown[]) : [];

    if (mode === "summary") {
      void reply.code(200).send({ success: true, data: allDevices, timestamp: new Date().toISOString() });
      return;
    }

    if (mode === "device_specific") {
      if (!deviceId) {
        void reply.code(400).send({ success: false, error: "device_id is required", timestamp: new Date().toISOString() });
        return;
      }

      const device =
        allDevices.find((d): d is Record<string, unknown> => {
          if (!d || typeof d !== "object") return false;
          const simple = (d as { simple_id?: unknown }).simple_id;
          const actual = (d as { actual_device_id?: unknown }).actual_device_id;
          return simple === deviceId || actual === deviceId;
        }) ?? null;

      if (!device) {
        void reply.code(404).send({ success: false, error: "device not found", timestamp: new Date().toISOString() });
        return;
      }

      void reply.code(200).send({
        success: true,
        data: {
          device_info: device,
          history_data: [],
          recent_anomalies: [],
          analysis: {
            data_quality: "unknown",
            stability_score: null,
            risk_assessment: null
          }
        },
        timestamp: new Date().toISOString()
      });
      return;
    }

    void reply.code(res.statusCode).send(res.body);
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
