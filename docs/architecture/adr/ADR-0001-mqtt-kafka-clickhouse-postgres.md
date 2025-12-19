# ADR-0001: MQTT + Kafka + ClickHouse + PostgreSQL（单机可扩展主链路）

## Status

- Status: Accepted
- Date: 2025-12-16

## Context

本项目存在以下现实约束与目标：

- 设备端可能高频上报，且存在乱序、重复、抖动与断电重连。
- 系统希望“一次性把标准写高”：未来数据量增大时尽量不改核心架构，只做水平/垂直扩容或参数调整。
- 单机部署（当前不迁移 K8s），但要求工程结构具备可演进性（可拆服务、可回放、可观测）。
- 遥测字段不固定：不同节点可能缺少某些传感器；新增指标不能频繁改表、改接口、改前端。
- 告警规则需要多传感器组合、窗口/防抖/缺失策略，并且要可解释、可回测；未来要预留 AI/预测模块。

## Options Considered

1) **设备 HTTP → API → 直接写数据库（PostgreSQL/ClickHouse）**

- 优点：实现直观，组件少
- 缺点：写入峰值/抖动直接打到业务 API；难以回放；后续引入规则/AI 时容易阻塞写链路；幂等/重试复杂度高

2) **MQTT → 单体 ingest → 直接写 ClickHouse**

- 优点：对设备友好；写入吞吐高
- 缺点：缺少“可回放”的队列层；规则/告警消费与写入耦合；故障恢复与重放成本高

3) **MQTT → Kafka → writer → ClickHouse（遥测） + Postgres（元数据/规则/告警）**（选定）

- 优点：
  - Kafka 缓冲削峰：写入服务/规则引擎慢也不阻塞设备端
  - 可重放：支持规则回测、问题定位与历史补算
  - 消费隔离：写入、规则、通知、实时推送可独立扩展/降级
  - 数据分工明确：遥测走 ClickHouse；强一致配置/规则/告警走 PostgreSQL
- 缺点：
  - 组件更多（MQTT/Kafka/ClickHouse/Postgres/Redis）
  - 单机资源要求更高，需要 runbook 与容量治理

## Decision

- 设备上报主入口采用 **MQTT**（统一身份鉴权与 topic ACL）。
- 入口 ingest 只做轻量标准化与鉴权，随后进入 **Kafka**（作为写链路缓冲与回放日志）。
- 遥测写入采用 **writer 批量落库到 ClickHouse**（高吞吐、时序查询/聚合友好）。
- 元数据、权限、规则、告警事件等强一致业务采用 **PostgreSQL**。
- 短期缓存/去重/限流计数采用 **Redis**（实现阶段可先按需引入）。

参考入口：

- MQTT 契约：`docs/integrations/mqtt/README.md`
- Kafka 契约：`docs/integrations/kafka/README.md`
- 存储契约：`docs/integrations/storage/README.md`
- 规则契约：`docs/integrations/rules/README.md`

## Consequences

- Positive
  - 写链路稳：设备端与后端处理解耦，避免“规则/AI 把上报链路拖死”
  - 可回放：后续排查/回测/补算有统一事件源
  - 可演进：单机也能按职责拆分服务，未来需要多机时迁移路径清晰
- Negative / Risks
  - 运维复杂度增加：需要单机 runbook、日志与容量治理
  - 需要纪律：契约优先（`integrations/`）与版本化（规则/事件）必须严格执行

