# Hooks 工作流建议（实现阶段启用）

本项目目前处于“完善计划”阶段，因此这里给出**未来实现阶段**建议启用的 hooks/workflow，用于保障质量与一致性。

## 1. Pre-commit（本地）

建议目标：
- 阻止明显错误进入仓库（格式、类型、契约漏改）

建议检查项（实现阶段）：
- Markdown：lint（标题层级、链接有效性可选）
- 文档一致性：变更是否同步到权威入口（参考 `docs/guides/ai/checklists.md`）
- API 契约：`docs/integrations/api/` 是否同步更新（避免前后端各写一份）
  - OpenAPI：`docs/integrations/api/openapi.yaml`（如涉及接口字段/响应结构，必须同步）
- MQTT/Kafka 契约：topic/envelope/字段命名是否一致
- DSL：
  - 规范：`docs/integrations/rules/rule-dsl-spec.md`
  - Schema：`docs/integrations/rules/rule-dsl.schema.json`
  - 要求：文档中的 DSL JSON 示例应能通过 schema 校验（实现阶段可写脚本抽取代码块校验）

## 2. CI（流水线）

建议最小流水线：
- 文档结构检查：
  - `docs/README.md` 是否引用了所有目录入口
  - `integrations/` 下是否存在对应 README
- 契约机器校验（实现阶段逐步启用）：
  - OpenAPI：`docs/integrations/api/openapi.yaml` 能被解析（结构正确）
  - Rule DSL：`docs/integrations/rules/rule-dsl.schema.json` 能校验示例（避免文档与实现脱节）
- DDL 变化检查：
  - Postgres/ClickHouse DDL 文件是否按编号执行顺序
- 规则 DSL 兼容检查：
  - dslVersion 是否为已支持版本
  - 关键字段是否存在（scope/when/severity）

## 3. Pull Request 模板（建议）

每个 PR 至少回答：
- 为什么改（引用 ADR 或写新的 ADR）
- 改了哪些契约（API/MQTT/Kafka/Storage/Rules）
- 如何验证（测试/脚本/手工步骤）
