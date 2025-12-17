# ADR（Architecture Decision Record）

本目录保存架构决策记录：**记录“为什么做这个选择”**，而不是写“怎么实现”。

规则：

- 每个 ADR 只解决一个决策点；跨决策请拆分多个 ADR。
- ADR 一旦 Accepted，不随实现细节频繁改动；若决策变化，新增 ADR（或写 Superseded）。
- ADR 必须引用对应契约入口（`docs/integrations/`），但不要复制粘贴契约内容。

命名规范：

- 文件名：`ADR-000X-<kebab-case>.md`
- 编号递增，不复用。

模板：

- `docs/architecture/adr/TEMPLATE.md`

