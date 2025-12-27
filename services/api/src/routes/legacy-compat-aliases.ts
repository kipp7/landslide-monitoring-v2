import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { InjectOptions } from "light-my-request";

type InjectResult = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

function safeJsonParse(payload: string): unknown {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as unknown;
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

function forwardHeaders(request: FastifyRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(request.headers)) {
    if (v === undefined) continue;
    headers[k] = Array.isArray(v) ? v.join(",") : typeof v === "string" ? v : String(v);
  }
  return headers;
}

export function registerLegacyCompatAliasRoutes(app: FastifyInstance): void {
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

  app.get("/monitoring-stations/chart-config", async (request, reply) => {
    const query = (request.query ?? {}) as { type?: unknown; chartType?: unknown };
    const chartType: string =
      typeof query.type === "string" ? query.type : typeof query.chartType === "string" ? query.chartType : "temperature";

    const meta: Record<string, { title: string; unit: string; yAxisName: string }> = {
      temperature: { title: "温度趋势图", unit: "°C", yAxisName: "温度" },
      humidity: { title: "湿度趋势图", unit: "%", yAxisName: "湿度" },
      acceleration: { title: "加速度趋势图", unit: "mg", yAxisName: "加速度" },
      gyroscope: { title: "陀螺仪趋势图", unit: "°/s", yAxisName: "角速度" },
      rainfall: { title: "雨量趋势图", unit: "mm", yAxisName: "降雨量" },
      gps_deformation: { title: "地质形变趋势图", unit: "mm", yAxisName: "位移" }
    };

    const fallbackMeta = { title: "温度趋势图", unit: "°C", yAxisName: "温度" };
    const chartMeta: { title: string; unit: string; yAxisName: string } = meta[chartType] ?? fallbackMeta;
    const title: string = chartMeta.title;
    const unit: string = chartMeta.unit;
    const yAxisName: string = chartMeta.yAxisName;

    const res = (await app.inject({
      method: "GET",
      url: "/monitoring-stations",
      headers: forwardHeaders(request)
    })) as unknown as InjectResult;

    const parsed = safeJsonParse(res.body);
    if (res.statusCode !== 200 || !parsed || typeof parsed !== "object") {
      const contentType = res.headers["content-type"];
      const contentTypeValue = Array.isArray(contentType) ? contentType.join(",") : contentType;
      if (contentTypeValue) reply.header("content-type", contentTypeValue);
      void reply.code(res.statusCode).send(res.body);
      return;
    }

    const obj = parsed as { success?: unknown; data?: unknown };
    const stations = Array.isArray(obj.data) ? (obj.data as unknown[]) : [];

    const deviceLegends: Record<string, string> = {};
    for (const station of stations) {
      if (!station || typeof station !== "object") continue;
      const s = station as Record<string, unknown>;
      const deviceId =
        typeof s.device_id === "string"
          ? s.device_id
          : typeof s.deviceId === "string"
            ? s.deviceId
            : typeof s.id === "string"
              ? s.id
              : "";
      if (!deviceId) continue;

      const legend =
        typeof s.chart_legend_name === "string"
          ? s.chart_legend_name
          : typeof s.chartLegendName === "string"
            ? s.chartLegendName
            : typeof s.station_name === "string"
              ? s.station_name
              : typeof s.stationName === "string"
                ? s.stationName
                : typeof s.device_name === "string"
                  ? s.device_name
                  : typeof s.deviceName === "string"
                    ? s.deviceName
                    : deviceId;

      deviceLegends[deviceId] = legend;
    }

    void reply.code(200).send({
      success: Boolean(obj.success),
      data: {
        chartType,
        title,
        unit,
        yAxisName,
        deviceLegends
      }
    });
  });

  app.put("/monitoring-stations/chart-legends", async (request, reply) => {
    await proxyInject(app, request, reply, "POST", "/monitoring-stations");
  });
}
