# AI Agent 工作约定（适用范围：docs/ 文档与重构阶段）

本文件约束 AI 在本项目“文档与重构阶段”的工作方式，降低遗漏与不一致，并避免 GitHub 上出现不规范的推送/分支管理。

## 1. 不允许的行为

- 不得为了找信息做大范围全局搜索作为主要手段；优先从 `docs/integrations/` 与 `docs/features/` 读取权威文档。
- 不得在多个目录重复定义同一契约（例如 API 在 features 里再写一份）。
- 不得把“实现细节”写进 ADR（ADR 只解释 Why）。
- 不得直接向 `main` 分支 push 或合并（必须走 PR）。
- 不得随意创建/推送无意义分支名（必须遵守分支命名规范）。

## 2. 修改规则

- 若修改接口/消息/存储/DSL：必须同步更新 `docs/integrations/` 对应文档。
- 若改动涉及关键决策（技术路线、数据模型、事件模型）：必须新增或更新 ADR。
- 若新增功能：必须先写 PRD（`docs/features/`），再写对接契约（`docs/integrations/`），最后写落地指南（`docs/guides/`）。
  - PRD 模板与目录结构见：`docs/features/README.md`
  - 变更同步清单见：`docs/guides/ai/checklists.md`
- 若涉及 Git 工作流/推送行为：必须遵守 `docs/guides/standards/git-workflow.md`。

## 3. 文档质量检查清单

- 标题、术语、ID/时间格式是否与 `docs/guides/standards/naming-conventions.md` 一致
- 所有路径引用是否存在且可点击
- 是否避免“写死实现”导致未来难以演进

## 4. 推送前门禁（必须）

- 推送前必须通过：`python docs/tools/run-quality-gates.py`
- 若修改了 `docs/integrations/api/openapi.yaml`，必须同步更新 `docs/integrations/api/openapi.sha256`：
  - `python docs/tools/update-openapi-stamp.py`

