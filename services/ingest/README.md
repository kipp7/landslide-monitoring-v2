# ingest-service（MQTT → Kafka）

本服务负责把设备端 MQTT 上报的 `TelemetryEnvelope` 校验后写入 Kafka（并把异常消息写入 DLQ），为后续 ClickHouse 落库、规则引擎回放提供统一事件源。

权威契约来源：

- MQTT：`docs/integrations/mqtt/README.md`
- Kafka：`docs/integrations/kafka/README.md`

## 环境变量

参考：`services/ingest/.env.example`

- `MQTT_URL`：例如 `mqtt://127.0.0.1:1883`
- `MQTT_USERNAME`：设备/服务端用户名（本阶段可先用服务端账号）
- `MQTT_PASSWORD`
- `MQTT_TOPIC_TELEMETRY`：默认 `telemetry/+`
- `KAFKA_BROKERS`：逗号分隔，例如 `127.0.0.1:9092`
- `KAFKA_CLIENT_ID`：默认 `ingest-service`
- `KAFKA_TOPIC_TELEMETRY_RAW`：默认 `telemetry.raw.v1`
- `KAFKA_TOPIC_TELEMETRY_DLQ`：默认 `telemetry.dlq.v1`

## 本地运行（开发）

1) 安装依赖（仓库根目录）：

- `npm install`

2) 构建：

- `npm run build`

3) 进入目录运行：

- `cd services/ingest`
- 复制 `.env.example` 为 `.env` 并填好（不要提交 `.env`）
- `node dist/index.js`

## 行为说明（当前实现）

- 收到 MQTT 消息后：
  - JSON 解析失败 → 写入 Kafka `telemetry.dlq.v1`（`reason_code=invalid_json`）
  - Schema 校验失败 → 写入 Kafka `telemetry.dlq.v1`（`reason_code=schema_validation_failed`）
  - 校验通过 → 写入 Kafka `telemetry.raw.v1`（补充 `received_ts`）

注意：Schema 文件当前直接引用 `docs/integrations/*/schemas`，实现阶段会把 schemas 固化为 `libs/` 的可发布包（见 `docs/guides/standards/code-generation.md`）。

