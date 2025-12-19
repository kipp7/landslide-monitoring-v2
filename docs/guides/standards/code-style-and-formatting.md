# 代码风格与格式化（必须遵守）

目标：用工具把“风格争论”消灭在提交前；让每一次提交都能被自动化校验；避免“项目越写越乱”。

## 1. 通用规则（所有语言）

- 编码：必须使用 UTF-8（不允许混用 GBK/ANSI）
- 换行：必须有文件末尾换行；禁止行尾空格
- 秘钥：禁止提交真实密钥/凭据/Token（见 `features/prd/security-and-access-control.md`）
- 日志：禁止在日志里输出密钥、完整 token、明文密码
- 兼容性：禁止“仅靠前端兜底/仅靠数据库约束”，边界层必须做校验

工具约束：

- 统一使用 `.editorconfig`（仓库根目录已提供）
- 所有 PR 必须通过：`python docs/tools/validate-contracts.py`

## 2. TypeScript/JavaScript（前端/Node）

- 格式化：统一使用 Prettier（禁止个人风格配置覆盖团队配置）
- 静态检查：统一使用 ESLint（Next/Node 分别配置）
- 类型：默认开启严格模式（`strict: true`），禁止 `any` 滥用
  - `any` 仅允许出现在“边界层”（API 输入解析、兼容旧数据）
  - 边界层必须尽快收敛为可追踪的 DTO/类型（配合 OpenAPI）
- 运行时校验：对外输入（HTTP body/query、MQTT payload、Kafka message）必须做 schema 校验或等价校验

## 3. SQL（PostgreSQL/ClickHouse）

- DDL 必须编号执行（已有：`integrations/storage/postgres/tables/*`）
- 禁止在业务代码里拼接 SQL 字符串执行（必须参数化）
- 禁止“随手改表结构”应对需求变化：遥测指标走稀疏模型，不写死列

## 4. 文档（Markdown）

- `integrations/` 里的示例必须自洽（字段命名/时间格式/UUID）
- MQTT/Kafka/Rules 示例必须能通过 JSON Schema 校验（见 `integrations/*/examples`）
- API 文档与 OpenAPI 必须同步修改（见 `guides/standards/api-contract-rules.md`）
