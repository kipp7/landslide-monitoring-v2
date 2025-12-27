import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { withPgClient } from "../postgres";

const querySchema = z.object({
  timeWindow: z.coerce.number().int().positive().max(24 * 30).default(24)
});

type AnomalyAggRow = {
  anomaly_type: string;
  count: string;
  priority: number;
  latest_time: string;
};

function severityFromPriority(priority: number): "red" | "orange" | "yellow" | "blue" | "normal" {
  if (priority === 1) return "red";
  if (priority === 2) return "orange";
  if (priority === 3) return "yellow";
  if (priority === 4) return "blue";
  return "normal";
}

function warningColor(level: "red" | "orange" | "yellow" | "blue" | "normal"): string {
  const colorMap: Record<typeof level, string> = {
    red: "#dc2626",
    orange: "#ea580c",
    yellow: "#d97706",
    blue: "#2563eb",
    normal: "#10b981"
  };
  return colorMap[level];
}

function recommendedAction(level: "red" | "orange" | "yellow" | "blue" | "normal"): string {
  const map: Record<typeof level, string> = {
    red: "立即启动一级应急响应",
    orange: "启动二级应急响应",
    yellow: "发布三级预警信息",
    blue: "发布四级预警信息",
    normal: "维持常规监测"
  };
  return map[level];
}

export function registerAnomalyAssessmentCompatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  pg: PgPool | null,
  opts?: { legacyResponse?: boolean }
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/anomaly-assessment", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:view"))) return;
    const parseQuery = querySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }
    const { timeWindow } = parseQuery.data;

    const processedAt = new Date().toISOString();

    if (!pg) {
      const fallback = {
        data: [],
        stats: { total: 0, red: 0, orange: 0, yellow: 0, blue: 0 },
        time_window: timeWindow,
        processed_at: processedAt,
        source: "fallback_no_pg"
      };

      if (opts?.legacyResponse) {
        reply.send({ success: false, error: "PostgreSQL 未配置", fallback_data: fallback, ...fallback });
        return;
      }

      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const rows = await withPgClient(pg, async (client) =>
      client.query<AnomalyAggRow>(
        `
          WITH e AS (
            SELECT
              COALESCE(NULLIF(title, ''), rule_id::text, alert_id::text) AS anomaly_type,
              CASE severity
                WHEN 'critical' THEN 1
                WHEN 'high' THEN 2
                WHEN 'medium' THEN 3
                WHEN 'low' THEN 4
                ELSE 99
              END AS priority,
              created_at
            FROM alert_events
            WHERE created_at >= now() - ($1::int || ' hours')::interval
              AND event_type IN ('ALERT_TRIGGER','ALERT_UPDATE')
          )
          SELECT
            anomaly_type,
            count(*)::text AS count,
            MIN(priority)::int AS priority,
            to_char(MAX(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS latest_time
          FROM e
          GROUP BY anomaly_type
          ORDER BY priority ASC, count(*) DESC
        `,
        [timeWindow]
      )
    );

    const data = rows.rows.map((r) => {
      const severity = severityFromPriority(r.priority);
      return {
        anomaly_type: r.anomaly_type,
        count: Number(r.count),
        severity,
        priority: r.priority === 99 ? 0 : r.priority,
        latest_time: r.latest_time,
        color: warningColor(severity),
        display_name: r.anomaly_type,
        recommended_action: recommendedAction(severity)
      };
    });

    const stats = {
      total: data.reduce((sum, item) => sum + item.count, 0),
      red: data.filter((d) => d.severity === "red").reduce((sum, item) => sum + item.count, 0),
      orange: data.filter((d) => d.severity === "orange").reduce((sum, item) => sum + item.count, 0),
      yellow: data.filter((d) => d.severity === "yellow").reduce((sum, item) => sum + item.count, 0),
      blue: data.filter((d) => d.severity === "blue").reduce((sum, item) => sum + item.count, 0)
    };

    const payload = {
      data,
      stats,
      time_window: timeWindow,
      processed_at: processedAt,
      source: "v2_alerts_compat"
    };

    if (opts?.legacyResponse) {
      reply.send({ success: true, ...payload });
      return;
    }

    ok(reply, payload, traceId);
  });
}
