# ADR-0003: 遥测采用稀疏点位模型（sensorKey + value），避免宽表频繁改结构

## Status

- Status: Accepted
- Date: 2025-12-16

## Context

- 设备字段不固定：不同节点可能缺少部分传感器；后续还会新增传感器/指标。
- 如果使用 PostgreSQL 宽表（很多列），会导致频繁 ALTER TABLE、索引膨胀、查询与写入耦合。
- 遥测数据量大且主要按“时间范围 + 指标”查询，需要高吞吐与高效聚合。

## Options Considered

1) PostgreSQL 宽表 iot_data（分区）  
- 优点：开发直观  
- 缺点：字段扩展痛苦；写入/查询压力集中；长期演进成本高  

2) ClickHouse 宽表（很多列）  
- 优点：查询快  
- 缺点：字段扩展仍需改表；不适配“稀疏字段”  

3) ClickHouse 稀疏点位模型（选定）  
- 优点：新增指标不改表；稀疏字段天然支持；聚合查询友好  
- 缺点：单条上报拆成多行，写入量变大，需要批量写与队列削峰  

## Decision

- 遥测存储采用 ClickHouse 的稀疏点位模型：`device_id + sensor_key + ts + value_*`。
- PostgreSQL 不存遥测历史，仅存：
  - `sensors` 字典表（指标定义）
  - `device_state`（最新值/影子，用于看板“实时”展示）

## Consequences

- Positive
  - 新增指标不需要改表结构
  - 稀疏字段天然支持
- Negative / Risks
  - 写入放大：需要批量写入与保留策略
  - 查询需要按 sensorKey 聚合，API 需标准化输出 series
- Follow-ups
  - 保持 `sensors` 字典与指标命名规范一致
  - 在 API 里统一曲线返回结构（series）

