# v2 功能缺口对照（参考区 vs v2）

目的：把参考区（`E:\学校\06 工作区\2\openharmony\landslide-monitor`）已有的页面/能力，逐项对照到 v2 的落地点（Web 路由 / API / Worker / 存储 / 契约文档），用于最终“功能不缺失”的验收与收尾收口。

> 说明：本表只做对照与缺口标记；不在此处讨论 UI 细节（UI 尽量保持 v2 现有风格）。

## 0) 前置：参考区源代码是否可用（强制检查）

缺口对照需要“参考区源代码（页面/接口）”可读。若参考区目录里只有 `.next/` 或 `node_modules/`，无法可靠枚举页面与能力，会导致对照验收失真。

当前已观测到：`E:\学校\06 工作区\2\openharmony\landslide-monitor\frontend` 下 **几乎没有源码**（仅 `.next/`、`node_modules/`、少量 `.env*` 与 `app/device-management/page.tsx.backup`）。

处理方式（二选一）：

1) 你提供一份“参考区源码快照”的目录路径（只读，不在其上修改）。
2) 你把参考区的前端/后端源码恢复到该路径（仍保持只读）。

在参考区未恢复前，本清单只能先基于“v2 已实现功能”做自检，并把“参考区对照”标记为待确认。

## 1) 目录与落地点速查（基于既有文档线索）

| 模块 | 参考区线索 | v2 落地点（已实现） | 备注/缺口 |
|---|---|---|---|
| 登录/鉴权/RBAC | `frontend/app/login` | Web: `/login`；API: `/api/v1/auth/*`；权限：`docs/integrations/storage/postgres/tables/02-permissions.sql` | ✅ |
| 站点/设备体系 | `frontend/app/api/hierarchy/*`、`frontend/app/api/monitoring-stations*` | Web: `/stations`、`/stations/{stationId}`；API: `/api/v1/stations/*`、`/api/v1/devices/*` | ✅ |
| 遥测数据分析 | `frontend/app/analysis`、`frontend/app/api/data-aggregation` | Web: `/analysis`（运行概览）、`/data`（浏览器）；API: `/api/v1/data/state|series|raw|statistics|export` | ✅ |
| 告警/规则 | `frontend/app/api/anomaly-assessment` 等 | Web: `/alerts`、`/alerts/rules`；API: `/api/v1/alerts/*`、`/api/v1/alert-rules/*` | ✅ |
| GPS 基准点 | `frontend/app/baseline-management` | Web: `/device-management/baselines`；API: `/api/v1/gps/baselines/*`；契约：`docs/integrations/api/08-gps-baselines.md` | ✅ |
| GPS 监测/形变 | `frontend/app/gps-deformation` | Web: `/gps-monitoring`、`/gps-deformation`；API: `/api/v1/gps/deformations/{deviceId}/series`；契约：`docs/integrations/api/09-gps-deformations.md` | ✅ |
| IoT 接入 | 设备上报/适配 | 服务：`services/huawei-iot-adapter`（HTTP Push → Kafka `telemetry.raw.v1`） | ✅ |
| 运维/排障 | system monitor / debug api | Web: `/ops/system-monitor`、`/ops/debug-api`、`/ops/telemetry-dlq`；API: `/api/v1/system/*`、`/api/v1/telemetry/dlq*` | ✅ |

另：v2 Web 路由清单见 `docs/guides/roadmap/v2-web-route-inventory.md`（用于验收走查）。

## 2) 下一步缺口检查方式（执行顺序）

1. 逐个参考区页面走查（登录后）：记录“入口/字段/动作/依赖数据”。
2. 在 v2 中定位：Web 路由 / API 路由 / OpenAPI / DB 表 / Kafka schema（以 `docs/integrations/` 为唯一权威）。
3. 若缺口存在：在 `docs/guides/roadmap/v2-module-workstreams.md` 新增一个最小子项（1 个分支 + 1 个 PR），避免大杂烩 PR。

## 3) v2 Web 路由清单（从 `apps/web/app/*/page.tsx` 枚举）

用于快速确认 v2 现有页面入口，作为“参考区缺口对照”的落地点索引：

- `/`：`apps/web/app/page.tsx`
- `/login`：`apps/web/app/login/page.tsx`
- `/analysis`：`apps/web/app/analysis/page.tsx`
- `/data`：`apps/web/app/data/page.tsx`
- `/stations`：`apps/web/app/stations/page.tsx`
- `/stations/{stationId}`：`apps/web/app/stations/[stationId]/page.tsx`
- `/device-management`：`apps/web/app/device-management/page.tsx`
- `/device-management/baselines`：`apps/web/app/device-management/baselines/page.tsx`
- `/alerts`：`apps/web/app/alerts/page.tsx`
- `/alerts/{alertId}`：`apps/web/app/alerts/[alertId]/page.tsx`
- `/alerts/rules`：`apps/web/app/alerts/rules/page.tsx`
- `/alerts/rules/{ruleId}`：`apps/web/app/alerts/rules/[ruleId]/page.tsx`
- `/settings`：`apps/web/app/settings/page.tsx`
- `/gps-monitoring`：`apps/web/app/gps-monitoring/page.tsx`
- `/gps-deformation`：`apps/web/app/gps-deformation/page.tsx`
- `/admin`：`apps/web/app/admin/page.tsx`
- `/admin/users`：`apps/web/app/admin/users/page.tsx`
- `/admin/access`：`apps/web/app/admin/access/page.tsx`
- `/ops`：`apps/web/app/ops/page.tsx`
- `/ops/system-monitor`：`apps/web/app/ops/system-monitor/page.tsx`
- `/ops/debug-api`：`apps/web/app/ops/debug-api/page.tsx`
- `/ops/configs`：`apps/web/app/ops/configs/page.tsx`
- `/ops/logs`：`apps/web/app/ops/logs/page.tsx`
- `/ops/api-stats`：`apps/web/app/ops/api-stats/page.tsx`
- `/ops/telemetry-dlq`：`apps/web/app/ops/telemetry-dlq/page.tsx`
- `/ops/telemetry-dlq/{messageId}`：`apps/web/app/ops/telemetry-dlq/[messageId]/page.tsx`
- `/system-monitor`：`apps/web/app/system-monitor/page.tsx`（兼容入口，最终建议统一到 `/ops/system-monitor`）
- `/debug-api`：`apps/web/app/debug-api/page.tsx`（兼容入口，最终建议统一到 `/ops/debug-api`）

## 4) 待确认/待补齐（需要参考区恢复后逐项验证）

- 参考区缺失：需要恢复“参考区源码快照”，否则无法确认“功能不缺失”。
- GPS 监测/形变页面：v2 已有 `/gps-monitoring` 与 `/gps-deformation`，需在“参考区恢复后”对照其字段/图表/导出能力是否一致，并按缺口拆分最小 PR。
