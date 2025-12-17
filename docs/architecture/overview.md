# Architecture Overview（单机 v2）

本文件提供“系统架构的长期事实”（偏 Why/What），实现细节请参考 `guides/` 与 `integrations/`。

## 核心决策入口（ADR）

- 技术主链路：`docs/architecture/adr/ADR-0001-mqtt-kafka-clickhouse-postgres.md`

## 风险与应对（单机按最坏情况）

- `docs/architecture/risk-register.md`

## 架构目标

- 单机部署仍具备工程可扩展性：高频上报、乱序/重复、队列积压可控；支持回放/回测。
- 指标不写死：不同设备字段可稀疏；新增指标不频繁改表结构。
- 规则与告警可解释：规则版本化、事件化告警、证据链完整。

## 系统分层（读写分离）

写链路（削峰 + 幂等）：

- MQTT（设备）→ ingest → Kafka → writer → ClickHouse
- Kafka → rule-engine → Postgres(alert_events) → notify

读链路（对前端友好）：

- API 读 Postgres（设备/站点/规则/告警/权限）
- API 读 ClickHouse（曲线/聚合）
- 实时推送只推“最新值/告警事件”，不推全量原始 telemetry

## 契约入口（Integrations）

- API：`docs/integrations/api/README.md`
- MQTT：`docs/integrations/mqtt/README.md`
- Kafka：`docs/integrations/kafka/README.md`
- Rules：`docs/integrations/rules/README.md`
- Storage：`docs/integrations/storage/README.md`
