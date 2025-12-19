import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { fail } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";
import { verifyDeviceSecret } from "../device-secret";

type EmqxResult = { result: "allow" | "deny"; is_superuser?: boolean };

function sendEmqxResult(reply: FastifyReply, result: EmqxResult): void {
  void reply.code(200).send(result);
}

function getHeader(request: FastifyRequest, name: string): string | undefined {
  const v = request.headers[name.toLowerCase()];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

function requireEmqxWebhookToken(config: AppConfig, request: FastifyRequest, reply: FastifyReply): boolean {
  if (!config.emqxWebhookToken) return true;
  const token = getHeader(request, "x-emqx-token");
  if (!token || token !== config.emqxWebhookToken) {
    const traceId = (request as { traceId?: string }).traceId ?? "unknown";
    fail(reply, 403, "禁止访问", traceId);
    return false;
  }
  return true;
}

function payloadFromRequest(request: FastifyRequest): Record<string, unknown> {
  const body = request.body;
  if (body && typeof body === "object") return body as Record<string, unknown>;
  return {};
}

const authnSchema = z.object({
  username: z.string().min(1).optional(),
  password: z.string().optional(),
  clientid: z.string().optional()
});

const aclSchema = z.object({
  username: z.string().min(1).optional(),
  topic: z.string().min(1),
  action: z.enum(["publish", "subscribe"])
});

function isAllowedDeviceTopic(action: "publish" | "subscribe", topic: string, deviceId: string): boolean {
  const pubAllowed = new Set([`telemetry/${deviceId}`, `presence/${deviceId}`, `cmd_ack/${deviceId}`]);
  const subAllowed = new Set([`cmd/${deviceId}`]);
  if (action === "publish") return pubAllowed.has(topic);
  return subAllowed.has(topic);
}

export function registerEmqxRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  app.post("/emqx/authn", async (request, reply) => {
    if (!requireEmqxWebhookToken(config, request, reply)) return;
    if (!pg) {
      sendEmqxResult(reply, { result: "deny" });
      return;
    }

    const parse = authnSchema.safeParse(payloadFromRequest(request));
    if (!parse.success) {
      sendEmqxResult(reply, { result: "deny" });
      return;
    }

    const username = (parse.data.username ?? "").trim();
    const password = parse.data.password ?? "";

    // Internal service account (ingest-service etc.)
    if (config.mqttInternalPassword && username === config.mqttInternalUsername) {
      const ok = password === config.mqttInternalPassword;
      sendEmqxResult(reply, ok ? { result: "allow", is_superuser: true } : { result: "deny" });
      return;
    }

    // Device auth: username = device_id(UUID), password = device_secret
    const deviceIdParse = z.string().uuid().safeParse(username);
    if (!deviceIdParse.success) {
      sendEmqxResult(reply, { result: "deny" });
      return;
    }
    const deviceId = deviceIdParse.data;
    if (!password) {
      sendEmqxResult(reply, { result: "deny" });
      return;
    }

    const allowed = await withPgClient(pg, async (client) => {
      const row = await queryOne<{ status: string; device_secret_hash: string }>(
        client,
        "SELECT status, device_secret_hash FROM devices WHERE device_id=$1",
        [deviceId]
      );
      if (!row) return false;
      if (row.status === "revoked") return false;
      if (!verifyDeviceSecret(password, row.device_secret_hash)) return false;

      await client.query(
        `
          UPDATE devices
          SET
            status = CASE WHEN status='inactive' THEN 'active' ELSE status END,
            last_seen_at = NOW(),
            updated_at = NOW()
          WHERE device_id = $1
        `,
        [deviceId]
      );

      return true;
    });

    sendEmqxResult(reply, allowed ? { result: "allow", is_superuser: false } : { result: "deny" });
  });

  app.post("/emqx/acl", async (request, reply) => {
    if (!requireEmqxWebhookToken(config, request, reply)) return;

    const parse = aclSchema.safeParse(payloadFromRequest(request));
    if (!parse.success) {
      sendEmqxResult(reply, { result: "deny" });
      return;
    }

    const username = (parse.data.username ?? "").trim();
    const { topic, action } = parse.data;

    // Internal service account: allow all topics.
    if (config.mqttInternalPassword && username === config.mqttInternalUsername) {
      sendEmqxResult(reply, { result: "allow" });
      return;
    }

    // For devices, enforce revoke immediately by checking DB status on every ACL decision.
    // This ensures a device that was already connected gets blocked from publish/subscribe after revoke.
    if (!pg) {
      sendEmqxResult(reply, { result: "deny" });
      return;
    }

    const deviceIdParse = z.string().uuid().safeParse(username);
    if (!deviceIdParse.success) {
      sendEmqxResult(reply, { result: "deny" });
      return;
    }

    const deviceId = deviceIdParse.data;
    const allowed = await withPgClient(pg, async (client) => {
      const row = await queryOne<{ status: string }>(
        client,
        "SELECT status FROM devices WHERE device_id=$1",
        [deviceId]
      );
      if (!row) return false;
      if (row.status === "revoked") return false;
      return isAllowedDeviceTopic(action, topic, deviceId);
    });
    sendEmqxResult(reply, allowed ? { result: "allow" } : { result: "deny" });
  });
}
