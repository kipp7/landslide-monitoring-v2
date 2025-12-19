# 契约完整性清单（v2：必须 100% 对齐）

本清单的目标是把“契约优先”落地为**可检查项**。当你认为“契约已完成”时，应逐项对照确认，避免遗漏导致前后端/设备/存储不一致。

建议配合脚本做机器检查：`python docs/tools/validate-contracts.py`（能覆盖 OpenAPI/示例/注册表路径等常见遗漏）。

## 1) API（HTTP）

权威入口：

- 文档入口：`docs/integrations/api/README.md`
- 机器可读：`docs/integrations/api/openapi.yaml`

完成标准（必须全部满足）：

- `openapi.yaml` 覆盖 `integrations/api/*.md` 中出现的所有端点与方法
- 所有端点均定义：
  - request（query/path/body）
  - response（成功/失败，至少 400/401/403/404/500）
  - 统一响应结构（含 `traceId`、UTC 时间）
- ID/时间/枚举值与 `docs/guides/standards/naming-conventions.md` 一致
- “写操作”明确幂等策略（如 commandId、ruleVersion）
- 明确查询保护（最大范围/最大点数/导出异步）

## 2) MQTT（设备对接）

权威入口：

- `docs/integrations/mqtt/README.md`

完成标准：

- Topic 规范明确（publish/subscribe、ACL 约束）
- TelemetryEnvelope v1 结构可机器校验（JSON Schema）
- 命令与回执消息结构可机器校验（JSON Schema）
- 身份鉴权与断电安全存储规范明确（device_id + secret + A/B slot）

## 3) Kafka（链路对接）

权威入口：

- `docs/integrations/kafka/README.md`

完成标准：

- Topic 列表明确（含版本号）
- 每个 topic 的 payload 有 schema（至少 JSON Schema/严格字段约定）
- DLQ 结构明确（reason_code、raw_payload、received_ts）
- 幂等键与分区键明确（device_id）

## 4) Storage（PostgreSQL + ClickHouse）

权威入口：

- `docs/integrations/storage/README.md`

完成标准：

- PostgreSQL DDL 可按编号顺序执行（含索引/约束/必要的 JSONB 字段）
- ClickHouse 表定义满足稀疏指标与 TTL/聚合规划
- 关键字段命名与 API/消息保持一致（尤其 device_id/deviceId 的映射规则要清楚）

## 5) Rules（DSL + 事件化告警）

权威入口：

- DSL 规范：`docs/integrations/rules/rule-dsl-spec.md`
- Schema：`docs/integrations/rules/rule-dsl.schema.json`

完成标准：

- DSL 示例可通过 schema 校验（至少 v1 核心示例）
- DSL 与落库映射一致（`alert_rule_versions.dsl_json` 必须保存完整 DSL）
- 事件化告警输出字段一致（alertId/ruleVersion/evidence）
