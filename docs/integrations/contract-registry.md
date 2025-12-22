# 契约注册表（Contract Registry，v2）

目标：提供“机器可读契约”的固定入口，避免全局搜索与多处散落导致遗漏。

## 1. HTTP（OpenAPI）

- `docs/integrations/api/openapi.yaml`

## 2. Rules（DSL）

- Rule DSL Schema：`docs/integrations/rules/rule-dsl.schema.json`

## 3. MQTT（设备协议）

- TelemetryEnvelope v1：`docs/integrations/mqtt/schemas/telemetry-envelope.v1.schema.json`
- PresenceEvent v1：`docs/integrations/mqtt/schemas/presence-event.v1.schema.json`
- DeviceCommand v1：`docs/integrations/mqtt/schemas/device-command.v1.schema.json`
- DeviceCommandAck v1：`docs/integrations/mqtt/schemas/device-command-ack.v1.schema.json`

## 4. Kafka（消息总线）

- telemetry.raw.v1：`docs/integrations/kafka/schemas/telemetry-raw.v1.schema.json`
- telemetry.dlq.v1：`docs/integrations/kafka/schemas/telemetry-dlq.v1.schema.json`
- alerts.events.v1：`docs/integrations/kafka/schemas/alerts-events.v1.schema.json`
- device.commands.v1：`docs/integrations/kafka/schemas/device-commands.v1.schema.json`
- device.command_acks.v1：`docs/integrations/kafka/schemas/device-command-acks.v1.schema.json`
- device.command_events.v1：`docs/integrations/kafka/schemas/device-command-events.v1.schema.json`
- ai.predictions.v1：`docs/integrations/kafka/schemas/ai-predictions.v1.schema.json`

## 5. Storage（DDL/表结构）

> Storage 属于“契约”的一部分：它约束了后端如何落库与回放。单机形态下，存储设计必须与 API/消息字段严格对齐。

- PostgreSQL DDL（按编号执行）：`docs/integrations/storage/postgres/tables/00-extensions.sql`
- ClickHouse DDL：`docs/integrations/storage/clickhouse/01-telemetry.sql`

## 6. 示例（Example Packs）

示例用于联调对齐与脚本校验：

- MQTT 示例：`docs/integrations/mqtt/examples/README.md`
- Kafka 示例：`docs/integrations/kafka/examples/README.md`
- Rules 示例：`docs/integrations/rules/examples/README.md`

## 7. Firmware（设备端适配规范）

设备端“运行行为/命令集合/采样上报策略”统一入口：

- `docs/integrations/firmware/README.md`

## 8. 使用规则

- 所有 schema 文件必须版本化（文件名含 `v1` / `v2`），新增字段必须考虑向后兼容。
- 文档示例（Markdown）必须与 schema 自洽；实现阶段建议写脚本从 Markdown 提取 JSON 块并做校验。
