import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";

type CameraStats = {
  fps: number;
  quality: number;
  resolution: string;
  uptime: number;
  cpu_usage: number;
  free_heap: number;
  wifi_rssi: number;
};

type CameraDevice = {
  id: string;
  ip: string;
  name: string;
  status: "online" | "offline" | "error";
  lastSeen: number;
  stats?: CameraStats | undefined;
};

const devices = new Map<string, CameraDevice>();

const defaultDevices: CameraDevice[] = [
  {
    id: "ESP32CAM_001",
    ip: "192.168.74.55",
    name: "ESP32-CAM",
    status: "offline",
    lastSeen: 0
  }
];

for (const d of defaultDevices) devices.set(d.id, d);

const idSchema = z.string().min(1).max(64);
const ipSchema = z.string().min(1).max(64);
const nameSchema = z.string().min(1).max(100);

const createDeviceSchema = z
  .object({
    id: idSchema,
    ip: ipSchema,
    name: nameSchema
  })
  .strict();

const statusQuerySchema = z
  .object({
    timeoutMs: z.coerce.number().int().min(1000).max(20000).default(5000)
  })
  .strict();

function withOnlineCalc(device: CameraDevice): CameraDevice {
  const active = device.lastSeen > 0 && Date.now() - device.lastSeen < 5 * 60 * 1000;
  return { ...device, status: active ? device.status : "offline" };
}

async function fetchDeviceStatus(device: CameraDevice, timeoutMs: number): Promise<CameraDevice> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const resp = await fetch(`http://${device.ip}/api/status`, { method: "GET", signal: controller.signal });
    if (!resp.ok) {
      return { ...device, status: "error" };
    }
    const json: unknown = await resp.json();
    device.status = "online";
    device.lastSeen = Date.now();
    if (json && typeof json === "object") device.stats = json as CameraStats;
    return device;
  } catch {
    return { ...device, status: "offline" };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function registerCameraRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/camera/devices", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    const list = Array.from(devices.values()).map(withOnlineCalc);
    ok(
      reply,
      { devices: list, total: list.length, online: list.filter((d) => d.status === "online").length },
      traceId
    );
  });

  app.get("/camera/devices/:cameraId/status", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;

    const parseId = idSchema.safeParse((request.params as { cameraId?: unknown }).cameraId);
    if (!parseId.success) {
      fail(reply, 400, "invalid cameraId", traceId, { field: "cameraId" });
      return;
    }
    const cameraId = parseId.data;

    const parseQuery = statusQuerySchema.safeParse(request.query ?? {});
    if (!parseQuery.success) {
      fail(reply, 400, "invalid query", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    const device = devices.get(cameraId);
    if (!device) {
      fail(reply, 404, "camera not found", traceId, { cameraId });
      return;
    }

    const updated = await fetchDeviceStatus({ ...device }, parseQuery.data.timeoutMs);
    devices.set(cameraId, updated);
    ok(reply, updated, traceId);
  });

  app.post("/camera/devices", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;

    const parsed = createDeviceSchema.safeParse(request.body);
    if (!parsed.success) {
      fail(reply, 400, "invalid body", traceId, { field: "body", issues: parsed.error.issues });
      return;
    }

    const body = parsed.data;
    const device: CameraDevice = { id: body.id, ip: body.ip, name: body.name, status: "offline", lastSeen: 0 };
    devices.set(device.id, device);
    ok(reply, device, traceId);
  });

  app.delete("/camera/devices/:cameraId", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;

    const parseId = idSchema.safeParse((request.params as { cameraId?: unknown }).cameraId);
    if (!parseId.success) {
      fail(reply, 400, "invalid cameraId", traceId, { field: "cameraId" });
      return;
    }
    const cameraId = parseId.data;
    devices.delete(cameraId);
    ok(reply, { cameraId }, traceId);
  });
}

export function registerCameraLegacyCompatRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  const legacyGetQuerySchema = z
    .object({
      deviceId: z.string().optional(),
      action: z.enum(["status"]).optional()
    })
    .strict();

  const legacyPostSchema = z
    .object({
      action: z.enum(["add", "update_status", "test_connection"]),
      deviceId: z.string().optional(),
      ip: z.string().optional(),
      name: z.string().optional(),
      status: z.string().optional(),
      stats: z.unknown().optional()
    })
    .passthrough();

  const legacyPutSchema = z
    .object({
      deviceId: z.string().min(1),
      ip: z.string().optional(),
      name: z.string().optional(),
      config: z.unknown().optional()
    })
    .passthrough();

  const legacyDeleteQuerySchema = z
    .object({
      deviceId: z.string().min(1)
    })
    .strict();

  const handleLegacyGet = async (request: FastifyRequest, reply: FastifyReply) => {
    if (pg && !(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;

    const parseQuery = legacyGetQuerySchema.safeParse(request.query ?? {});
    if (!parseQuery.success) {
      void reply.code(400).send({ error: "参数错误" });
      return;
    }

    const { deviceId, action } = parseQuery.data;
    if (deviceId && action === "status") {
      const device = devices.get(deviceId);
      if (!device) {
        void reply.code(404).send({ error: "设备不存在" });
        return;
      }
      const updated = await fetchDeviceStatus({ ...device }, 5000);
      devices.set(deviceId, updated);
      void reply.code(200).send(updated);
      return;
    }

    const list = Array.from(devices.values()).map(withOnlineCalc);
    void reply.code(200).send({ devices: list, total: list.length, online: list.filter((d) => d.status === "online").length });
  };

  const handleLegacyPost = async (request: FastifyRequest, reply: FastifyReply) => {
    if (pg && !(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;

    const parseBody = legacyPostSchema.safeParse(request.body);
    if (!parseBody.success) {
      void reply.code(400).send({ error: "参数错误" });
      return;
    }

    const body = parseBody.data;
    switch (body.action) {
      case "add": {
        if (!body.deviceId || !body.ip || !body.name) {
          void reply.code(400).send({ error: "缺少必要参数" });
          return;
        }
        const device: CameraDevice = { id: body.deviceId, ip: body.ip, name: body.name, status: "offline", lastSeen: 0 };
        devices.set(device.id, device);
        void reply.code(200).send({ message: "设备添加成功", device });
        return;
      }
      case "update_status": {
        if (!body.deviceId) {
          void reply.code(400).send({ error: "缺少设备ID" });
          return;
        }
        const device = devices.get(body.deviceId);
        if (!device) {
          void reply.code(404).send({ error: "设备不存在" });
          return;
        }
        const updated: CameraDevice = {
          ...device,
          status:
            body.status === "online" || body.status === "offline" || body.status === "error" ? body.status : "online",
          lastSeen: Date.now(),
          ...(body.stats ? { stats: body.stats as CameraStats } : {})
        };
        devices.set(device.id, updated);
        void reply.code(200).send({ message: "状态更新成功", device: updated });
        return;
      }
      case "test_connection": {
        if (!body.ip) {
          void reply.code(400).send({ error: "缺少IP地址" });
          return;
        }
        const ip = body.ip;
        void reply
          .code(200)
          .send(
            await (async () => {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => {
                controller.abort();
              }, 5000);
              try {
                const resp = await fetch(`http://${ip}/api/status`, { method: "GET", signal: controller.signal });
                const httpOk = resp.ok;
                const stats: unknown = httpOk ? await resp.json() : null;
                const wsOk = true;
                return { ip, http: httpOk, websocket: wsOk, stats: httpOk ? stats : null, message: httpOk ? "连接成功" : "连接失败" };
              } catch (error) {
                return {
                  ip,
                  http: false,
                  websocket: false,
                  stats: null,
                  message: "连接超时或失败",
                  error: error instanceof Error ? error.message : String(error)
                };
              } finally {
                clearTimeout(timeoutId);
              }
            })()
          );
        return;
      }
    }
  };

  const handleLegacyPut = async (request: FastifyRequest, reply: FastifyReply) => {
    if (pg && !(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;

    const parseBody = legacyPutSchema.safeParse(request.body);
    if (!parseBody.success) {
      void reply.code(400).send({ error: "参数错误" });
      return;
    }

    const body = parseBody.data;
    const device = devices.get(body.deviceId);
    if (!device) {
      void reply.code(404).send({ error: "设备不存在" });
      return;
    }

    if (typeof body.ip === "string" && body.ip.trim()) device.ip = body.ip.trim();
    if (typeof body.name === "string" && body.name.trim()) device.name = body.name.trim();
    devices.set(body.deviceId, device);

    if (body.config && device.status === "online") {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 5000);
      try {
        await fetch(`http://${device.ip}/api/config`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body.config),
          signal: controller.signal
        });
      } catch {
        // best-effort: device may be offline / unreachable
      } finally {
        clearTimeout(timeoutId);
      }
    }

    void reply.code(200).send({ message: "设备更新成功", device });
  };

  const handleLegacyDelete = async (request: FastifyRequest, reply: FastifyReply) => {
    if (pg && !(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;

    const parseQuery = legacyDeleteQuerySchema.safeParse(request.query ?? {});
    if (!parseQuery.success) {
      void reply.code(400).send({ error: "参数错误" });
      return;
    }

    const { deviceId } = parseQuery.data;
    const device = devices.get(deviceId);
    if (!device) {
      void reply.code(404).send({ error: "设备不存在" });
      return;
    }

    devices.delete(deviceId);
    void reply.code(200).send({ message: "设备删除成功", deviceId });
  };

  for (const path of ["/camera", "/api/camera", "/iot/api/camera"]) {
    app.get(path, handleLegacyGet);
    app.post(path, handleLegacyPost);
    app.put(path, handleLegacyPut);
    app.delete(path, handleLegacyDelete);
  }
}
