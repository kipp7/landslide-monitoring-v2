# v2 Web 路由清单（Route Inventory）

用途：用于“参考区 vs v2”的走查验收，避免漏页面入口。

> 说明：清单基于 `apps/web/app/**/page.tsx` 盘点；动态路由以 `[...]` 表示参数段。

| Route | Source |
|---|---|
| `/` | `apps/web/app/page.tsx` |
| `/admin` | `apps/web/app/admin/page.tsx` |
| `/admin/access` | `apps/web/app/admin/access/page.tsx` |
| `/admin/users` | `apps/web/app/admin/users/page.tsx` |
| `/alerts` | `apps/web/app/alerts/page.tsx` |
| `/alerts/[alertId]` | `apps/web/app/alerts/[alertId]/page.tsx` |
| `/alerts/rules` | `apps/web/app/alerts/rules/page.tsx` |
| `/alerts/rules/[ruleId]` | `apps/web/app/alerts/rules/[ruleId]/page.tsx` |
| `/analysis` | `apps/web/app/analysis/page.tsx` |
| `/analysis-v2` | `apps/web/app/analysis-v2/page.tsx` |
| `/analysis-legacy` | `apps/web/app/analysis-legacy/page.tsx` |
| `/analysis2` | `apps/web/app/analysis2/page.tsx` |
| `/data` | `apps/web/app/data/page.tsx` |
| `/data/ai-predictions` | `apps/web/app/data/ai-predictions/page.tsx` |
| `/data/health-expert` | `apps/web/app/data/health-expert/page.tsx` |
| `/data/realtime` | `apps/web/app/data/realtime/page.tsx` |
| `/debug-api` | `apps/web/app/debug-api/page.tsx` |
| `/baseline-management` | `apps/web/app/baseline-management/page.tsx` |
| `/baseline-management-v2` | `apps/web/app/baseline-management-v2/page.tsx` |
| `/device-management` | `apps/web/app/device-management/page.tsx` |
| `/device-management/baselines` | `apps/web/app/device-management/baselines/page.tsx` |
| `/device-management-v2` | `apps/web/app/device-management-v2/page.tsx` |
| `/gps-deformation` | `apps/web/app/gps-deformation/page.tsx` |
| `/gps-monitoring` | `apps/web/app/gps-monitoring/page.tsx` |
| `/login` | `apps/web/app/login/page.tsx` |
| `/ops` | `apps/web/app/ops/page.tsx` |
| `/ops/api-stats` | `apps/web/app/ops/api-stats/page.tsx` |
| `/ops/configs` | `apps/web/app/ops/configs/page.tsx` |
| `/ops/debug-api` | `apps/web/app/ops/debug-api/page.tsx` |
| `/ops/logs` | `apps/web/app/ops/logs/page.tsx` |
| `/ops/system-monitor` | `apps/web/app/ops/system-monitor/page.tsx` |
| `/ops/telemetry-dlq` | `apps/web/app/ops/telemetry-dlq/page.tsx` |
| `/ops/telemetry-dlq/[messageId]` | `apps/web/app/ops/telemetry-dlq/[messageId]/page.tsx` |
| `/settings` | `apps/web/app/settings/page.tsx` |
| `/stations` | `apps/web/app/stations/page.tsx` |
| `/stations/[stationId]` | `apps/web/app/stations/[stationId]/page.tsx` |
| `/system-monitor` | `apps/web/app/system-monitor/page.tsx` |
| `/system-monitor-v2` | `apps/web/app/system-monitor-v2/page.tsx` |
| `/optimized-demo` | `apps/web/app/optimized-demo/page.tsx` |
| `/optimized-demo-v2` | `apps/web/app/optimized-demo-v2/page.tsx` |
