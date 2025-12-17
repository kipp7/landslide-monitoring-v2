# PRD：仪表盘与实时展示（单机）

## 1. 背景

看板需要展示：设备在线、最新值、告警概览、曲线查询；但不能导致 ClickHouse 被大范围扫描。

## 2. 目标

- 最新值走 `device_state`（影子），曲线走 ClickHouse（series）。
- 告警概览基于事件聚合得到。
- 查询范围受限（防止拖垮单机）。

## 3. 验收标准

- 首页可展示：总设备数、在线数、活动告警数、今日数据量。
- 任意曲线查询必须限制最大时间范围与最大点数（由系统配置控制）。

## 4. 依赖

- API：`docs/integrations/api/05-data.md`、`docs/integrations/api/07-system.md`
- DB：`docs/integrations/storage/postgres/tables/05-iot-data.sql`（device_state）
- ClickHouse：`docs/integrations/storage/clickhouse/01-telemetry.sql`

