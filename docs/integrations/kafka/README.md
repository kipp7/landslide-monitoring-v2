# integrations/kafka/

该目录描述内部数据总线对接契约（topic、分区键、消费组、DLQ、回放）。

索引：
- `docs/integrations/kafka/kafka-topics-and-processing.md`

机器可读（Schema）：

- telemetry.raw.v1：`docs/integrations/kafka/schemas/telemetry-raw.v1.schema.json`
- telemetry.dlq.v1：`docs/integrations/kafka/schemas/telemetry-dlq.v1.schema.json`
- alerts.events.v1：`docs/integrations/kafka/schemas/alerts-events.v1.schema.json`
- device.commands.v1：`docs/integrations/kafka/schemas/device-commands.v1.schema.json`
- device.command_acks.v1：`docs/integrations/kafka/schemas/device-command-acks.v1.schema.json`
