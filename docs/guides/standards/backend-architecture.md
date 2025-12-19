# 后端工程结构规范（实现阶段必须遵守）

目标：即使单机部署，也按“可拆分/可扩展/可回放”的标准组织代码，避免把所有逻辑堆进一个服务里。

## 1. 服务边界（建议拆分）

建议至少拆分为以下服务/进程（单机也可用不同进程运行）：

- `api-service`：对外 HTTP API（用户/设备/站点/规则/告警/系统）
- `ingest-service`：MQTT 接入与鉴权后的标准化入 Kafka（轻逻辑）
- `writer-service`：消费 Kafka 写入 ClickHouse（批量写）
- `rule-engine-worker`：消费 Kafka +（可选）查询 ClickHouse，产出告警事件
- `notify-worker`：消费 alerts.events，负责通知/推送

禁止：

- 设备高频写入直接打到 `api-service`（必须先入 Kafka）
- 规则/AI 阻塞写链路（必须异步、可降级）

## 2. 分层结构（每个服务内部）

每个服务内部推荐分层（名称可调整，但职责必须清晰）：

- `routes/`：HTTP 路由（只做输入校验与调用 usecase）
- `usecases/`：业务用例（组合 domain + repositories）
- `domain/`：领域模型与规则（不依赖数据库/框架）
- `repositories/`：存储访问（Postgres/ClickHouse/Redis）
- `integrations/`：外部依赖（MQTT/Kafka 客户端、第三方服务）
- `contracts/`：DTO 与 schema（从 `integrations/` 的契约生成或手写对齐）

## 3. 配置与密钥

- 所有配置来自 env/secret 文件；不得在代码中写回退真实 key。
- 配置必须可打印“是否存在/版本号/环境”，但不得打印明文 secret。

## 4. 日志与可观测性

- 结构化日志（JSON）必须包含：`traceId`、`service`、`requestId`（如有）
- 每个服务必须提供 `/health`（轻量）与 `/metrics`（实现阶段可选）

## 5. 契约优先

- HTTP 契约：`docs/integrations/api/openapi.yaml`
- MQTT/Kafka/Rules schema：见 `docs/integrations/contract-registry.md`
- 实现阶段建议：将 schema 校验纳入 CI（见 `docs/guides/ai/hooks-workflow.md`）

