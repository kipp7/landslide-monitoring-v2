# PRD：遥测上报链路（MQTT → Kafka → ClickHouse）

## 1. 背景

设备高频上报存在峰值、重复、乱序、缺字段；需要削峰与可回放能力，且新增指标不频繁改表。

## 2. 目标

- 支持稀疏指标上报（metrics map），新增传感器不改表结构。
- 支持幂等去重（优先 `deviceId + seq`）。
- 写入链路可在积压时“延迟变大但不丢数据”。

## 3. 非目标

- v1 不追求多机高可用（单机可恢复即可）。

## 4. 功能需求

- MQTT topic 与 payload 标准化（TelemetryEnvelope）。
- Kafka topic 固定（telemetry.raw.v1 / telemetry.dlq.v1）。
- ClickHouse 存储为稀疏点位模型（telemetry_raw）。
- DLQ：坏数据隔离并可追溯 reason。

## 5. 验收标准

- 设备每秒上报 1 条，链路可持续运行；重复上报不导致重复写入（幂等生效）。
- 乱序（event_ts 乱序）不影响窗口计算（默认按 received_ts）。
- JSON 字段缺失不导致写入失败（按缺失策略处理）。
- 坏数据进入 DLQ，不阻塞主链路。

## 6. 依赖

- ADR：`docs/architecture/adr/ADR-0001-mqtt-kafka-clickhouse-postgres.md`
- ADR：`docs/architecture/adr/ADR-0003-sparse-telemetry-model.md`
- MQTT：`docs/integrations/mqtt/mqtt-topics-and-envelope.md`
- Kafka：`docs/integrations/kafka/kafka-topics-and-processing.md`
- ClickHouse：`docs/integrations/storage/clickhouse/01-telemetry.sql`

