# Kafka 示例（与 JSON Schema 对齐）

本目录存放 Kafka topic payload 的**机器可验证**示例，用于：

- 约束 ingest/rules/alert 等服务之间的字段与命名
- 作为契约校验脚本输入（见 `docs/tools/validate-contracts.py`）

示例文件：

- `telemetry-raw.v1.json`
- `telemetry-dlq.v1.json`
- `alerts-events.v1.json`
- `device-commands.v1.json`
- `device-command-acks.v1.json`
- `device-command-events.v1.json`
- `presence-events.v1.json`
