# Kafka 主题规划与处理链路（单机也按大规模标准写）

目标：削峰、可回放、可并行消费、坏数据隔离（DLQ），保证后续数据量增长时主要靠“扩容/调参”而不是改业务代码。

## 1. Topic 列表（v1）

- `telemetry.raw.v1`
  - ingest-service 写入的标准化 `TelemetryEnvelope`
  - 分区键：`device_id`
- `telemetry.dlq.v1`
  - 无法解析/鉴权失败/字段非法/写入失败等进入 DLQ（需要可追溯原因）
- `alerts.events.v1`
  - rule-engine-worker 输出的告警事件（触发/更新/恢复/确认）
- `device.commands.v1`
  - API 下发的设备命令（cmd）
- `device.command_acks.v1`
  - 设备回执（ack）

机器可读（Schema）：

- alerts.events.v1：`docs/integrations/kafka/schemas/alerts-events.v1.schema.json`
- device.commands.v1：`docs/integrations/kafka/schemas/device-commands.v1.schema.json`
- device.command_acks.v1：`docs/integrations/kafka/schemas/device-command-acks.v1.schema.json`

## 2. 分区与消费组建议

- 分区数（单机初始）：建议从 `3~6` 起步（便于并行与未来扩展），后续可提升。
- 生产端（ingest）：以 `device_id` 作为 key，保证同一设备消息有序（至少在分区内）。
- 消费组：
  - `telemetry-writer`：消费 `telemetry.raw.v1`
  - `rule-engine-worker`：消费 `telemetry.raw.v1`（或消费 writer 产出的“写入确认事件”，视实现）
  - `notify-worker`：消费 `alerts.events.v1`

## 3. 幂等与去重（必须）

- 推荐：设备上报带 `seq`，后端以 `device_id + seq` 去重。
- 去重策略可实现为：
  - Redis 去重缓存（短期，例如 1~24 小时，避免重复写 ClickHouse）
  - ClickHouse 侧做“近似去重”（例如写入时记录 `seq`，查询时按 `argMax`/`max` 取最新）
  - 两者结合：写入层强去重，查询层弱去重

## 4. DLQ（死信队列）规范

进入 `telemetry.dlq.v1` 的消息必须包含：

- `reason_code`（例如 `AUTH_FAILED`、`INVALID_JSON`、`SCHEMA_UNSUPPORTED`、`WRITE_FAILED`）
- `reason_detail`（可选）
- `received_ts`
- `raw_payload`（或截断后的 payload）

DLQ 的目标：

- 主链路不中断
- 可追踪坏数据来源
- 可用于后续回放/修复（不要求自动恢复，但要可操作）

机器可读（Schema）：

- telemetry.raw.v1：`docs/integrations/kafka/schemas/telemetry-raw.v1.schema.json`
- telemetry.dlq.v1：`docs/integrations/kafka/schemas/telemetry-dlq.v1.schema.json`

## 5. 回放（Replay）原则

Kafka 的回放能力用于：

- 规则升级后按历史数据回测（同规则版本得到一致结果）
- 临时故障（ClickHouse 写入失败）后补写

回放规则：

- 必须幂等，否则回放会造成重复数据/重复告警
- 规则引擎必须版本化（`rule_version`），避免“重算结果无法解释”
