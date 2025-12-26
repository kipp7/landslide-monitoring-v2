import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { InjectOptions } from "light-my-request";

type InjectResult = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

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
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(request.headers)) {
    if (v === undefined) continue;
    headers[k] = Array.isArray(v) ? v.join(",") : typeof v === "string" ? v : String(v);
  }

  const injectOpts: InjectOptions = { method, url, headers };
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
  app.put("/device-management", async (request, reply) => {
    const now = new Date().toISOString();

    let body: unknown = request.body ?? {};
    if (typeof body === "string") {
      try {
        body = JSON.parse(body) as unknown;
      } catch {
        void reply.code(400).send({ success: false, error: "invalid json body", timestamp: now });
        return;
      }
    }

    if (!body || typeof body !== "object") {
      void reply.code(400).send({ success: false, error: "invalid body", timestamp: now });
      return;
    }

    const record = body as Record<string, unknown>;
    const deviceId = typeof record.device_id === "string" ? record.device_id.trim() : "";
    if (!deviceId) {
      void reply.code(400).send({ success: false, error: "device_id is required", timestamp: now });
      return;
    }

    const data: Record<string, unknown> = { ...record };
    delete data.device_id;

    void reply.code(200).send({
      success: true,
      message: "device info updated",
      data: { device_id: deviceId, ...data },
      timestamp: now
    });
  });

  app.get("/device-management-optimized", async (request, reply) => {
    await proxyInject(app, request, reply, "GET", `/device-management${toQueryString(request.query)}`);
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
