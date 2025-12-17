# AI 工作流（AIAgents & Hooks）

目标：让 AI “不靠全局搜索”也能高质量地实现功能/修复 Bug，并能遵守项目规范。

## 1. AI 阅读顺序（强制）

1) `docs/README.md`（Docs Hub）
2) `docs/architecture/`（Why）
3) `docs/features/`（What）
4) `docs/integrations/`（契约）
5) `docs/guides/`（How-to）
6) `docs/incidents/`（历史问题）

## 2. 修改前检查清单

- 是否新增/修改了契约？（API/MQTT/Kafka/Storage/Rules）
- 是否新增/修改了 ADR？（关键决策必须有 why）
- 是否更新了 PRD/SPEC？（功能边界与验收标准明确）
- 是否按清单同步更新入口？`docs/guides/ai/checklists.md`

## 3. Hooks 建议（实现阶段）

建议在实现阶段增加（不是现在强制）：

- pre-commit：
  - lint/format
  - 校验 OpenAPI 文档是否同步
- CI：
  - schema 校验（Rule DSL）
  - 迁移脚本检查（Postgres/ClickHouse）

补充：

- 具体 hooks/CI 建议见：`docs/guides/ai/hooks-workflow.md`
