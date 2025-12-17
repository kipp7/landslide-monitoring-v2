# 语言政策（全仓统一，必须遵守）

目标：仓库内容对团队学习友好（中文为主），同时保持工程“可复用/可迁移/可对外展示”的专业性（关键标识与接口保持国际化约束）。

本政策解决的问题：

- 避免“文档全英文看不懂、写不下去”导致文档烂尾。
- 避免“全中文命名/接口字段”导致难以与生态对接、难以复用到其他项目。
- 让 AI/人类在同一套规则下产出一致的文档与代码。

## 1) 总原则（强制）

- **说明性内容用中文**：PRD/Spec/ADR/Runbook/Incident/Issue/PR 描述以中文为主。
- **标识性内容用英文**：目录名、文件名、代码标识符（变量/函数/类名）、接口字段名、topic 名、表名等必须使用英文。
- **专业术语保留英文**：如 `MQTT`、`Kafka`、`ClickHouse`、`PostgreSQL`、`OpenAPI`、`DTO`、`traceId` 等，不强行翻译。

这样可以同时满足：

- 学习效率（中文解释清楚“为什么/怎么验收/怎么排查”）
- 工程可迁移性（英文标识符 + 标准化接口）
- 对外呈现（GitHub 项目结构与行业习惯一致）

## 2) 文档语言（Docs / PRD / ADR / Incident）

- 内容主体：中文。
- 标题：中文为主，必要时括号附带英文关键词（可选）。
- 任何“机器可读契约”（OpenAPI/JSON Schema/SQL DDL）必须是英文标识符。
- 文档中引用路径/命令/标识符时，必须使用代码块或行内代码（反引号）。

建议写法：

- “为什么（Why）”写清楚：背景、约束、权衡、风险与回滚。
- “是什么（What）”写清楚：范围、非目标、验收标准（DoD）。
- “怎么做（How-to）”写清楚：步骤、命令、预期输出、排障指引。

模板入口：

- ADR：`docs/architecture/adr/TEMPLATE.md`
- PRD/Spec：`docs/features/templates/`
- Incident：`docs/incidents/TEMPLATE-postmortem.md`

## 3) Git 与协作（Commit / PR / Issue）

- Commit message：允许中文 subject（推荐中文），但必须满足 `Conventional Commits` 结构，详见：
  - `docs/guides/standards/git-workflow.md`
  - `.github/commit-message-template.txt`
- PR 模板：中文（仓库已提供），见 `.github/pull_request_template.md`。
- Issue 模板：中文（仓库已提供），见 `.github/ISSUE_TEMPLATE/`。
- 分支名：必须英文（kebab-case），便于命令行与 URL 复制、检索与跨平台兼容。

## 4) 代码与接口命名（必须英文）

必须英文的内容（强制）：

- 代码标识符：`camelCase` / `PascalCase` / `SCREAMING_SNAKE_CASE`
- HTTP API：路径、query、字段名、错误码字段（参考 `docs/integrations/api/openapi.yaml`）
- MQTT Topic：topic 名、payload 字段
- Kafka：topic 名、message 字段、schema 文件名
- 存储：表名、列名、索引名、迁移文件名

允许中文的内容（推荐）：

- UI 展示文本（App/Web）
- 日志信息（但字段 key、结构化日志字段名仍用英文）
- 业务规则说明、告警内容模板（可在 `rules`/`templates` 中定义）

## 5) 常见误区（必须避免）

- “为了学习/方便”把接口字段写成中文：后续所有 SDK/数据库/可视化都会痛苦。
- 把“文档中文”误解为“全部中文命名”：本仓库明确禁止。
- 用翻译替代契约：契约以 OpenAPI/Schema 为准，文档只是解释与示例。

