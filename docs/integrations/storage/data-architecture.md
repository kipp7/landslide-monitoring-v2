# 存储设计（PostgreSQL + ClickHouse，不写死）

目标：业务数据强一致、遥测数据高吞吐与高效聚合；新增传感器/指标不频繁改表结构。

## 1. PostgreSQL（元数据/规则/告警/权限）

### 核心表（建议 v1 最小集合）

- `users`、`roles`、`user_roles`
- `stations`
- `devices`
  - `device_id`（PK）
  - `status`（inactive/active/revoked）
  - `secret_hash`（只存 hash）
  - `last_seen_at`
  - `metadata_json`（JSONB，用于可扩展字段：型号/固件/采样率/安装信息）
- `sensors`（字典表，全局指标定义）
  - `sensor_key`（唯一，如 `displacement_mm`）
  - `unit`、`data_type`（float/int/bool/string）
  - `min/max`、`description`、`tags`（JSONB/数组）
- `device_sensors`（可选：声明设备“应有”哪些传感器）
- `alert_rules`、`alert_rule_versions`
  - 规则必须版本化（`rule_version`），避免后续无法解释历史告警
- `alert_events`
- `device_commands`（命令下发与状态）
- `audit_logs`

### 为什么需要 JSONB

在“指标可扩展、不写死”的前提下，一些变化快但不参与复杂查询的字段放 JSONB 更合适：

- 设备侧 meta：固件版本、采样间隔、供电方式、安装角度等
- 规则配置：DSL/条件树/窗口参数（仍需版本化）

## 2. ClickHouse（遥测时序）

### 设计原则

- 采用“稀疏点位模型”：每个 metric 一行，不做宽表大量列。
- 以 `received_ts` 为主时间轴（便于处理设备时间漂移、乱序）。
- 支持按设备/站点/传感器与时间范围查询、聚合。

### telemetry_raw（建议列）

- `received_ts` DateTime64
- `event_ts` Nullable(DateTime64)
- `device_id` String
- `sensor_key` LowCardinality(String)
- `seq` Nullable(UInt64)
- `value_f64` Nullable(Float64)
- `value_i64` Nullable(Int64)
- `value_str` Nullable(String)
- `value_bool` Nullable(UInt8)
- `quality` Nullable(UInt8)
- `schema_version` UInt16

说明：

- 同一条上报拆成多行：`metrics` 中每个 key 写一行到 `telemetry_raw`。
- 值类型通过不同列承载，避免把所有值塞 JSON（不利于聚合查询）。

### 聚合表（建议）

为了曲线性能与长期存储，建议规划聚合表（可后续实现）：

- `telemetry_agg_1m`：按 1 分钟聚合（avg/min/max/last）
- `telemetry_agg_1h`：按 1 小时聚合

聚合规则：

- 原始数据保留期较短（例如 30 天，可配置）
- 聚合数据保留更久（例如 1 年或更久）

## 3. “不写死”的落地方式

- 新增指标：只需在 PostgreSQL `sensors` 插入定义；设备开始上报该 `sensor_key` 即可落 ClickHouse。
- 删除/停用指标：在 `sensors` 标记 `disabled`（不要立刻删历史数据）。
- 设备缺传感器：不影响写入；是否异常由规则引擎决定（缺失策略配置化）。

