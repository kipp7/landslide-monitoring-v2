# services/

后端服务层（可运行的进程/容器）。

原则：

- 以 “MQTT → Kafka → ClickHouse + Postgres” 为主链路（见 ADR）
- 边界层必须做输入校验（HTTP/MQTT/Kafka）
- 所有服务必须可观测（traceId、结构化日志、关键指标）

建议的服务拆分（单机也适用）：

- `services/api/`：HTTP API（管理端/移动端）
- `services/ingest/`：MQTT → Kafka（schema 校验、DLQ）
- `services/telemetry-writer/`：Kafka → ClickHouse（批量写入）
- `services/rule-engine/`：规则/AI worker（事件化告警）
- `services/notify/`：通知 worker（可选）

