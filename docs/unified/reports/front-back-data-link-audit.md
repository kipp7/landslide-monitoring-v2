# front-back-data-link-audit

## Status

- task: `front-back-data-link-audit`
- state: `completed`
- updated_at: `2026-03-15`

## Scope

本轮只做主线真值梳理，目标是回答三件事：

1. 前端当前依赖了哪些数据接口
2. 这些接口在后端是否有真实实现
3. 数据库 / seed / 查询链路里哪里还没有真正打通

## 1. 当前前端依赖清单

### 1.1 `apps/desk`

当前主线 `apps/desk/src/api/httpClient.ts` 仍依赖 legacy `/api/*`：

- `/api/dashboard/summary`
- `/api/dashboard/weekly-trend`
- `/api/monitoring-stations`
- `/api/devices`
- `/api/gps-deformation/{deviceId}`
- `/api/baselines*`
- `/api/system/status`

Desk 当前消费模型仍停留在旧主线：

- `DashboardSummary`
- `WeeklyTrend`
- `SystemStatus = cpu/mem/disk`

补充真值：

- `desk-api-align` worktree 已将正式期待形状收口为：
  - `weeklyTrend`：`labels/rainfallMm/alertCount/source/note`
  - `system status`：`source/note/items[]`
- 但这套消费模型还没有完整回流到主线 `apps/desk`

### 1.2 `apps/web`

`apps/web/lib/api/*` 当前主要依赖 v1 `/api/v1/*`：

- `dashboard.ts` → `/api/v1/dashboard`、`/api/v1/system/status`
- `stations.ts` → `/api/v1/stations*`
- `devices.ts` → `/api/v1/devices*`、`/api/v1/data/state/*`、命令相关接口
- `gpsBaselines.ts` → `/api/v1/gps/baselines*`
- `gpsDeformations.ts` → `/api/v1/gps/deformations/*`
- `system.ts` → `/api/v1/system/configs`、`/api/v1/system/logs/*`
- 以及 alerts / sensors / ai / telemetry-dlq 等 v1 接口

但 `apps/web/app` 里仍有一批页面/legacy hooks 直接走 legacy 或 demo 路径：

- `/api/device-management*`
- `/api/monitoring-stations*`
- `/api/data-aggregation`
- `/api/gps-deformation/*`
- `/api/baselines*`
- 硬编码 demo 数据组件：如 `analysis2/components/MonitoringPoints.tsx`

## 2. 后端真实实现落点

### 2.1 v1 正式接口

主要在 `services/api/src/routes/*`：

- `stations.ts`：PostgreSQL `stations`
- `devices.ts`：PostgreSQL `devices`、命令表、device_state
- `gps-baselines.ts`：PostgreSQL `gps_baselines`
- `gps-deformations.ts`：PostgreSQL `gps_baselines` + ClickHouse `telemetry_raw`
- `data.ts`：ClickHouse `telemetry_raw`，必要时回退 PostgreSQL `device_state`
- `system.ts`：
  - `/dashboard`：PostgreSQL `stations/devices/alert_events` + ClickHouse 当日计数
  - `/dashboard/weekly-trend`：ClickHouse `rainfall_mm` + PostgreSQL `alert_events`
  - `/system/status`：PostgreSQL / ClickHouse / Kafka 健康摘要

### 2.2 legacy 兼容接口

主要由：

- `legacy-device-management.ts`
- `gps-baselines-advanced.ts`
- `gps-deformation-legacy.ts`
- `system.ts` 中新增的 legacy compat

当前可确认：

- `/api/dashboard/summary`
- `/api/dashboard/weekly-trend`
- `/api/system/status`

都已存在，且已做过最小真实返回验证。

## 3. 数据库存储与 seed 链路

### 3.1 PostgreSQL 负责

- `stations`
- `devices`
- `gps_baselines`
- `alert_events`
- `system_configs`
- `api_logs`
- 命令、通知、AI 预测等业务表

### 3.2 ClickHouse 负责

- `telemetry_raw`
- `todayDataCount`
- GPS 形变聚合
- `weeklyTrend.rainfallMm`

### 3.3 当前 seed 入口分裂

当前至少有两套重要 demo 数据入口：

- `infra/compose/scripts/seed-demo.ps1`
- `docs/integrations/storage/postgres/tables/14-seed-data.sql`

它们并不完全一致。

已确认的冲突点：

- `DEMO001` 的名称 / 坐标口径不一致
- `seed-demo.ps1` 是运行态实际导数脚本
- `14-seed-data.sql` 更像静态初始化参考

## 4. 当前“已打通 / 半打通 / 未打通”判断

### 4.1 已打通

- Web v1 基础资源查询：
  - stations
  - devices
  - gps baselines
  - gps deformations
  - system configs / logs / stats
- Desk 所需的 W2 核心兼容接口：
  - dashboard summary
  - dashboard weekly trend
  - system status
- 主线已具备：
  - 后端实现
  - 最小真实返回留证
  - Desk 构建通过

### 4.2 半打通

- `apps/desk` 主线代码仍是旧消费模型，和 `desk-api-align` worktree 的最新模型未完全合流
- `weeklyTrend` 已有接口，但当前雨量聚合对 ClickHouse 运行态凭据敏感；环境不一致时会回退为 0
- Web 的一部分页面虽然有 v1 wrapper，但页面层还混着 legacy/demo 页面，并非全部走统一链路

### 4.3 未真正打通

- `analysis2/components/MonitoringPoints.tsx` 等硬编码 demo 页面，不连接主线数据库
- `gps-monitoring/page.tsx` 仍走 `/api/baselines`、`/api/device-management`、`/api/gps-deformation` 的 legacy 组合链
- `optimized-demo/*`、部分 `legacy/hooks/*` 仍依赖旧聚合与代理路径
- `seed-demo.ps1` 与 `14-seed-data.sql` 的 demo 站点口径不统一

## 5. 当前最值得优先处理的三件事

### 第一优先级：统一前端主入口

目标：

- 明确哪些页面算“当前正式前端入口”
- 非正式 demo / legacy 页标记为参考或调试用途

建议：

- Desk 继续以 `desk-api-align` 的当前消费模型为准
- Web 以 `apps/web/lib/api/*` + v1 页面为准

### 第二优先级：统一 seed 真值

目标：

- 明确 `seed-demo.ps1` 与 `14-seed-data.sql` 谁是运行态真值

建议：

- 运行态以 `seed-demo.ps1` 为准
- `14-seed-data.sql` 只保留字典和静态初始化参考，或同步成同一口径

### 第三优先级：清理“表面接了 API，实际还在 demo/legacy”的页面

优先对象：

- `apps/web/app/gps-monitoring/page.tsx`
- `apps/web/app/optimized-demo/*`
- `apps/web/app/analysis2/components/MonitoringPoints.tsx`

## 6. 下一步实现建议

1. 先新建一条主任务，专门处理“前端正式入口收口”
2. 再新建一条主任务，统一 demo seed 与运行态口径
3. 最后再处理 legacy/demo 页面迁移，不和前两条混在一起
