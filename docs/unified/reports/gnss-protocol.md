---
title: gnss-protocol
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/gnss-protocol
---

# GNSS / 协议 / 基线报告

## 基本信息

- 任务名：`gnss-protocol`
- 工作树：`gnss-protocol`
- 当前状态：`ready_for_integration`

## 最近结论

- 已完成第一轮 GNSS / 协议 / 基线资料收口
- 已形成统一稿和权威来源梳理
- 已明确当前权威依据集中在 `docs/integrations/api`、`docs/integrations/mqtt`、`docs/integrations/iot`、`docs/integrations/firmware`、`docs/integrations/storage`
- 已提出 `gps_latitude`、`gps_longitude`、`gps_altitude` 等字段统一方向

## 主要输出

- `docs/unified/gnss-protocol-baseline.md`

## 当前待办

- 等待进入 `integration`
- 后续可继续承担 `sensor-dictionary-sync`

## Sensor Dictionary Sync（2026-03-12）

### 本轮工作

- 核对 canonical GNSS key：
  - `gps_latitude`
  - `gps_longitude`
  - `gps_altitude`
- 修订命名规范
- 修订 MQTT 文档示例
- 修订 `sensors` seed 数据

### 当前结论

- GNSS canonical key 已明确为：
  - `gps_latitude`
  - `gps_longitude`
  - `gps_altitude`
- `gps_lat`、`gps_lng`、`gps_lon`、`gps_alt` 仅保留为 compat alias
- 已在以下文件中形成真实产出：
  - `docs/guides/standards/naming-conventions.md`
  - `docs/integrations/mqtt/mqtt-topics-and-envelope.md`
  - `docs/integrations/storage/postgres/tables/14-seed-data.sql`

### 当前判断

- `sensor-dictionary-sync` 已完成
- 可以进入下一轮集成