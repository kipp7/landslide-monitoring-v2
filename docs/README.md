# 滑坡监测系统重构计划（Docs Hub）

本目录作为“可复用工程化模板”的文档中心。设计目标是：**AI 与人类都不需要全局搜索**，只需从固定入口进入相应目录即可找到权威信息。

## 文档布局（v2）

- `docs/architecture/`：架构（Why），以 ADR 为核心
- `docs/features/`：需求与规格（What），PRD/Spec/验收标准
- `docs/integrations/`：对接契约（Interface），API/MQTT/Kafka/Storage/Rules
- `docs/guides/`：实践指南（How-to），runbook、最佳实践、工作流
- `docs/incidents/`：事故复盘（Postmortem）
- `docs/archive/`：历史归档（保持故事）

## 当前架构关键决策

- `docs/architecture/adr/ADR-0001-mqtt-kafka-clickhouse-postgres.md`
- `docs/architecture/adr/ADR-0002-device-identity-device-id-secret.md`
- `docs/architecture/adr/ADR-0003-sparse-telemetry-model.md`
- 风险清单：`docs/architecture/risk-register.md`

## integrations（唯一契约来源）

- API：`docs/integrations/api/README.md`
- MQTT：`docs/integrations/mqtt/README.md`
- Kafka：`docs/integrations/kafka/README.md`
- Rules：`docs/integrations/rules/README.md`
- Storage：`docs/integrations/storage/README.md`
- 契约校验脚本：`docs/tools/validate-contracts.py`
- 质量门禁一键执行：`docs/tools/run-quality-gates.py`

## guides（落地指南）

- 标准：`docs/guides/standards/README.md`
- 语言与写作规范（先读）：`docs/guides/standards/language-policy.md`
- 单机 runbook：`docs/guides/runbooks/README.md`
- 下一步与路线图：`docs/guides/roadmap/README.md`
- 项目当前状态（交接入口）：`docs/guides/roadmap/project-status.md`
- 审查与差距分析：`docs/guides/audits/README.md`
- 重构启动清单（开始写代码前必读）：`docs/guides/roadmap/kickoff-checklist.md`

## 代码仓库结构（v2）

- 仓库顶层结构规范：`docs/guides/standards/repo-structure-and-naming.md`
- 代码目录骨架：`README.md`

## 兼容目录（Deprecated）

旧文档结构不再保留（按当前重构规划要求）。
