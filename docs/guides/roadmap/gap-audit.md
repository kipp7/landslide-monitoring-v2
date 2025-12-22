# v2 功能缺口对照（参考区 vs v2）

目的：把参考区（`E:\学校\06 工作区\2\openharmony\landslide-monitor`）已有的页面/能力，逐项对照到 v2 的落地点（Web 路由 / API / Worker / 存储 / 契约文档），用于最终“功能不缺失”的验收与收尾收口。

> 说明：本表只做对照与缺口标记；不在此处讨论 UI 细节（UI 尽量保持 v2 现有风格）。

## 1) 目录与落地点速查

| 模块 | 参考区线索 | v2 落地点（已实现） | 备注/缺口 |
|---|---|---|---|
| 登录/鉴权/RBAC | `frontend/app/login` | Web: `/login`；API: `/api/v1/auth/*`；权限：`docs/integrations/storage/postgres/tables/02-permissions.sql` | ✅ |
| 站点/设备体系 | `frontend/app/api/hierarchy/*`、`frontend/app/api/monitoring-stations*` | Web: `/stations`、`/stations/{stationId}`；API: `/api/v1/stations/*`、`/api/v1/devices/*` | ✅ |
| 遥测数据分析 | `frontend/app/analysis`、`frontend/app/api/data-aggregation` | Web: `/analysis`（运行概览）、`/data`（浏览器）；API: `/api/v1/data/state|series|raw|statistics|export` | ✅ |
| 告警/规则 | `frontend/app/api/anomaly-assessment` 等 | Web: `/alerts`、`/alerts/rules`；API: `/api/v1/alerts/*`、`/api/v1/alert-rules/*` | ✅ |
| GPS 基准点 | `frontend/app/baseline-management` | Web: `/device-management/baselines`；API: `/api/v1/gps/baselines/*`；契约：`docs/integrations/api/08-gps-baselines.md` | ✅ |
| GPS 形变序列 | `frontend/app/gps-deformation` | API: `/api/v1/gps/deformations/{deviceId}/series`；契约：`docs/integrations/api/09-gps-deformations.md` | ✅（Web 对接可后续单独做） |
| IoT 接入 | 设备上报/适配 | 服务：`services/huawei-iot-adapter`（HTTP Push → Kafka `telemetry.raw.v1`） | ✅ |
| 运维/排障 | system monitor / debug api | Web: `/ops/system-monitor`、`/ops/debug-api`；API: `/api/v1/system/*` | ✅ |

## 2) 下一步缺口检查方式（执行顺序）

1. 逐个参考区页面走查（登录后）：记录“入口/字段/动作/依赖数据”。
2. 在 v2 中定位：Web 路由 / API 路由 / OpenAPI / DB 表 / Kafka schema（以 `docs/integrations/` 为唯一权威）。
3. 若缺口存在：在 `docs/guides/roadmap/v2-module-workstreams.md` 新增一个最小子项（1 个分支 + 1 个 PR），避免大杂烩 PR。

