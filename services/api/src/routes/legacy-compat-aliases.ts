import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { InjectOptions } from "light-my-request";

type InjectResult = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

function copyRequestHeaders(request: FastifyRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(request.headers)) {
    if (v === undefined) continue;
    headers[k] = Array.isArray(v) ? v.join(",") : typeof v === "string" ? v : String(v);
  }
  return headers;
}

function replyWithInjectResult(reply: FastifyReply, res: InjectResult): void {
  const contentType = res.headers["content-type"];
  const contentTypeValue = Array.isArray(contentType) ? contentType.join(",") : contentType;
  if (contentTypeValue) reply.header("content-type", contentTypeValue);
  void reply.code(res.statusCode).send(res.body);
}

function replyJson(reply: FastifyReply, statusCode: number, payload: unknown): void {
  reply.header("content-type", "application/json; charset=utf-8");
  void reply.code(statusCode).send(JSON.stringify(payload));
}

function getQueryStringParam(query: unknown, key: string): string | undefined {
  if (!query || typeof query !== "object") return undefined;
  const raw = (query as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function stripModeParams(query: unknown): Record<string, unknown> {
  if (!query || typeof query !== "object") return {};
  const { mode: _mode, device_id: _deviceId, deviceId: _deviceId2, ...rest } = query as Record<string, unknown>;
  return rest;
}

async function inject(app: FastifyInstance, request: FastifyRequest, method: "GET" | "POST" | "PUT", url: string): Promise<InjectResult> {
  const headers = copyRequestHeaders(request);
  const injectOpts: InjectOptions = { method, url, headers };
  if (method !== "GET") {
    injectOpts.payload = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});
  }
  return (await app.inject(injectOpts)) as unknown as InjectResult;
}

function safeParseJsonObject(body: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
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
  const res = await inject(app, request, method, url);
  replyWithInjectResult(reply, res);
}

async function proxyDeviceManagementReal(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const mode = (getQueryStringParam(request.query, "mode") ?? "all").toLowerCase();
  const deviceKey = getQueryStringParam(request.query, "device_id") ?? getQueryStringParam(request.query, "deviceId");

  if (mode === "device_specific" && deviceKey) {
    const nowIso = new Date().toISOString();

    const hierRes = await inject(
      app,
      request,
      "GET",
      `/device-management/hierarchical${toQueryString(stripModeParams(request.query))}`
    );
    const hierRoot = safeParseJsonObject(hierRes.body);
    if (hierRoot?.success === true) {
      const data = hierRoot.data;
      const allDevices =
        data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).allDevices)
          ? ((data as Record<string, unknown>).allDevices as Record<string, unknown>[])
          : [];
      const deviceRow = allDevices.find((d) => {
        const simpleId = typeof d.simple_id === "string" ? d.simple_id : null;
        const actualId = typeof d.actual_device_id === "string" ? d.actual_device_id : null;
        const deviceId = typeof d.device_id === "string" ? d.device_id : null;
        const deviceName = typeof d.device_name === "string" ? d.device_name : null;
        return simpleId === deviceKey || actualId === deviceKey || deviceId === deviceKey || deviceName === deviceKey;
      });

      if (deviceRow) {
        replyJson(reply, 200, {
          success: true,
          data: {
            device_info: deviceRow,
            history_data: [],
            recent_anomalies: [],
            analysis: { data_quality: null, stability_score: null, risk_assessment: null }
          },
          timestamp: nowIso
        });
        return;
      }
    }

    const res = await inject(app, request, "GET", `/device-management?device_id=${encodeURIComponent(deviceKey)}`);
    const root = safeParseJsonObject(res.body);
    if (root?.success === true && typeof root.data !== "undefined") {
      replyJson(reply, 200, {
        success: true,
        data: {
          device_info: root.data,
          history_data: [],
          recent_anomalies: [],
          analysis: { data_quality: null, stability_score: null, risk_assessment: null }
        },
        timestamp: nowIso
      });
      return;
    }

    replyWithInjectResult(reply, res);
    return;
  }

  const res = await inject(app, request, "GET", `/device-management/hierarchical${toQueryString(stripModeParams(request.query))}`);
  const root = safeParseJsonObject(res.body);
  if (root?.success === true) {
    const data = root.data;
    const nowIso = new Date().toISOString();

    if (mode === "summary") {
      const allDevices =
        data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).allDevices)
          ? ((data as Record<string, unknown>).allDevices as unknown[])
          : [];
      replyJson(reply, 200, { success: true, data: allDevices, timestamp: nowIso });
      return;
    }

    if (data && typeof data === "object" && !("summary" in (data as Record<string, unknown>))) {
      const allDevices = Array.isArray((data as Record<string, unknown>).allDevices)
        ? ((data as Record<string, unknown>).allDevices as Record<string, unknown>[])
        : [];
      const totalDataPoints = allDevices.reduce((sum, d) => {
        const v = d.today_data_count;
        return sum + (typeof v === "number" && Number.isFinite(v) ? v : 0);
      }, 0);
      const baselinesEstablished = allDevices.reduce((sum, d) => sum + (d.baseline_established ? 1 : 0), 0);
      (data as Record<string, unknown>).summary = {
        total_data_points: totalDataPoints,
        baselines_established: baselinesEstablished,
        last_update: nowIso
      };
      root.data = data;
      replyJson(reply, 200, root);
      return;
    }
  }

  replyWithInjectResult(reply, res);
}

export function registerLegacyCompatAliasRoutes(app: FastifyInstance): void {
  app.get("/device-management-optimized", async (request, reply) => {
    await proxyInject(app, request, reply, "GET", `/device-management${toQueryString(request.query)}`);
  });

  app.get("/device-management-real", async (request, reply) => {
    await proxyDeviceManagementReal(app, request, reply);
  });

  app.get("/device-management-real-db", async (request, reply) => {
    await proxyDeviceManagementReal(app, request, reply);
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
