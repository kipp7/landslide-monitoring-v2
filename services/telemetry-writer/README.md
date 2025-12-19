# telemetry-writer（Kafka → ClickHouse）

本服务负责消费 Kafka `telemetry.raw.v1`，将“稀疏指标”拆分为多行写入 ClickHouse `landslide.telemetry_raw`，为曲线查询/聚合分析/告警回放提供可靠的时序存储。

权威契约来源：
- Kafka：`docs/integrations/kafka/README.md`
- ClickHouse：`docs/integrations/storage/clickhouse/01-telemetry.sql`

## 环境变量

参考：`services/telemetry-writer/.env.example`

## 本地运行（开发）

1) 安装依赖（仓库根目录）：
- `npm install`

2) 构建：
- `npm run build`

3) 进入目录运行：
- `cd services/telemetry-writer`
- 复制 `.env.example` 为 `.env` 并填写（不要提交 `.env`）
- `node dist/index.js`

## 行为说明（当前实现）

- 消费 Kafka topic：`telemetry.raw.v1`
- 校验消息是否符合：`docs/integrations/kafka/schemas/telemetry-raw.v1.schema.json`
- 将 `metrics` 展开为多行插入 ClickHouse（每个 metric 一行）：
  - 数值：写入 `value_i64`（可安全表示的整数）或 `value_f64`
  - 字符串：写入 `value_str`
  - 布尔：写入 `value_bool`（0/1）
  - `received_ts` 作为主时间轴；`event_ts`（若有）作为设备侧事件时间

注意：
- writer 会将“无法解析 JSON / schema 不匹配 / ClickHouse 写入失败（疑似数据错误）”的消息写入 `telemetry.dlq.v1`，避免坏消息阻塞消费并保留可追溯线索。
- 对“ClickHouse 不可达/网络超时”等疑似基础设施问题，writer 会重试并在多次失败后中止本批次处理（不提交 offset），等待恢复后重放。
- writer 默认对 Kafka 单条消息大小设置保护（`MESSAGE_MAX_BYTES`），并会截断 DLQ 的 `raw_payload`（`DLQ_RAW_PAYLOAD_MAX_BYTES`），避免极端 payload 造成内存压力与日志/消息膨胀。
- writer 会按 `STATS_LOG_INTERVAL_MS` 周期输出处理统计（写入批次、DLQ 数量等），便于单机 Compose 排查与容量评估。
- schema 当前直接引用 `docs/` 下的 JSON Schema；后续会固化为 `libs/` 的可复用资源包（便于版本化与发布）。
