# 文档写作规范（必须遵守）

目标：让文档可长期维护、可复用、可被 AI 直接消费；避免“只写一半/写完就过期/多人写法不一致”。

适用范围：`docs/` 全部内容（含 ADR/PRD/Spec/Integrations/Runbook/Incident）。

## 1) 文档必须回答的 5 个问题

每篇文档至少要能明确回答：

1. 这是什么（定义）？
2. 为什么要做（背景/问题/约束）？
3. 做到什么程度算完成（验收标准/DoD）？
4. 不做什么（非目标/边界）？
5. 风险与回滚是什么（如何安全变更）？

## 2) 入口与“单一权威”（Single Source of Truth）

- `docs/README.md` 是文档中心（Docs Hub），任何新增目录/重要文档都必须在入口出现。
- `docs/integrations/` 是“对接契约”的唯一来源：
  - OpenAPI/Schema/示例统一放在 integrations，禁止在别处复制一份。
- `docs/architecture/adr/` 只记录“为什么”（Why），不要变成“实现教程”。
- `docs/guides/` 才写“怎么做”（How-to），并且必须可按步骤执行。

## 3) 标准结构（推荐但尽量统一）

### 3.1 ADR（架构决策）

必须包含：

- Context（背景与约束）
- Decision（决策是什么）
- Consequences（影响与代价）
- Alternatives（备选方案与拒绝理由）

模板：`docs/architecture/adr/TEMPLATE.md`

### 3.2 PRD（需求）

必须包含：

- 背景与目标（Why）
- 用户与场景（Who/When）
- 范围与非目标（Scope/Non-goals）
- 验收标准（DoD / Acceptance Criteria）
- 风险与依赖（Risk/Deps）

模板：`docs/features/templates/TEMPLATE-PRD.md`

### 3.3 Spec（规格/方案）

必须包含：

- 数据流/模块边界（What/How）
- 接口契约引用（只引用 integrations，不复制内容）
- 关键策略（幂等/重试/限流/降级）
- 观测性（日志/指标/traceId）
- 测试策略（单测/集成/冒烟）

模板：`docs/features/templates/TEMPLATE-SPEC.md`

### 3.4 Integrations（对接契约）

必须包含：

- “适用范围/版本”说明
- 字段/Topic/路径的清晰定义
- 至少 1 个正向示例 + 1 个错误示例（如果适用）
- 与其他契约的交叉引用（如 MQTT → Kafka → Storage）

模板：`docs/integrations/*/TEMPLATE.md`

### 3.5 Incident（事故复盘）

必须包含：

- 影响范围（Impact）
- 时间线（Timeline）
- 根因（Root Cause）
- 修复与预防（Fix/Prevention）
- 证据材料（Evidence）

模板：`docs/incidents/TEMPLATE-postmortem.md`

## 4) 写作与格式要求（强制）

- 所有路径/命令/标识符必须用反引号包裹：例如 `docs/integrations/api/openapi.yaml`、`python docs/tools/run-quality-gates.py`。
- 示例必须自洽：同一概念不要出现多套命名与格式（尤其是时间、UUID、单位）。
- 任何“重要变更”必须在 PR 中同步更新文档入口与清单：
  - 入口：`docs/README.md`
  - integrations 清单：`docs/integrations/contracts-checklist.md`

## 5) 与质量门禁的关系

本仓库已经把“契约一致性”和“敏感信息”做成门禁脚本，要求 PR 必须通过：

- `python docs/tools/run-quality-gates.py`

新增/修改契约时，必须保证示例与 schema 一致，否则会在 CI 中失败。

