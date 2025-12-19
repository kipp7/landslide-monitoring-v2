# Git 工作流与推送规则（必须遵守）

目标：让仓库在 GitHub 上长期可维护，避免“乱推分支、乱改主分支、提交信息不可追溯”。

配套必读（强制）：

- GitHub 仓库治理（分支保护/合并策略）：`docs/guides/standards/github-repo-governance.md`
- PR 操作指南（页面步骤/标题/内容/修 CI）：`docs/guides/standards/pull-request-howto.md`

## 1) 分支策略（强制）

### 1.1 主分支（main）

- `main` 必须始终保持可用（门禁通过、可部署、可回滚）。
- **禁止**直接向 `main` push（包括 AI / 人工）。
- 所有变更必须通过 Pull Request 合入。

### 1.2 工作分支（feature branches）

分支命名必须可读、可检索，推荐：

- `feat/<scope>-<short-desc>`：新增功能
- `fix/<scope>-<short-desc>`：修复问题
- `docs/<scope>-<short-desc>`：文档/契约调整
- `chore/<scope>-<short-desc>`：工程/脚本/依赖/CI
- `refactor/<scope>-<short-desc>`：重构（不改行为或最小行为变化）

示例：

- `feat/api-device-onboarding`
- `fix/rules-dsl-schema`
- `docs/contract-registry`
- `chore/ci-quality-gates`

规则：

- 分支必须从 `main` 拉出：`git checkout -b <branch> origin/main`
- 一个 PR 尽量只解决一类问题（单一主题）。

## 2) 推送与合并规则（强制）

### 2.1 推送前检查（必须）

推送前必须确保门禁通过：

- `python docs/tools/run-quality-gates.py`

如果修改了 OpenAPI：

- `python docs/tools/update-openapi-stamp.py`

### 2.2 合并方式（推荐）

GitHub 合并建议使用：

- **Squash and merge**（推荐）：保持 `main` 历史干净，每个 PR 对应一个 commit
- 或 **Rebase and merge**：适合多人协作且保持线性历史

不建议：

- Merge commit（会造成历史噪音，除非团队明确需要）

### 2.3 Force push（禁止）

- 禁止对 `main` 做 force push。
- 对个人分支也不建议 force push（除非明确知道后果且 PR 尚未 review）。

## 3) Commit 规范（强制）

### 3.1 提交格式（Conventional Commits）

必须使用以下格式：

```
<type>(<scope>): <subject>
```

type 取值：

- `feat` / `fix` / `docs` / `refactor` / `chore` / `test`

scope 建议：

- `docs`、`api`、`mqtt`、`kafka`、`rules`、`storage`、`ci`、`repo`、`web`、`mobile`、`firmware`

subject（必须）：

- 中文或英文都可以，但必须简洁、可读，避免“update/modify”等无信息词。

示例：

- `docs(api): 补齐 auth 响应示例`
- `chore(ci): 添加 quality-gates workflow`
- `refactor(repo): 统一 docs 目录结构`

### 3.2 提交粒度

- 允许多 commit 推送到同一个 PR（review 更友好）
- 合并到 `main` 时推荐 squash（最终在 `main` 上保留 1 个 commit）

## 4) PR 规范（强制）

PR 必须包含：

- 变更说明（为什么做）
- 影响范围（docs/services/apps/infra）
- 门禁结果（至少说明已通过 `run-quality-gates`）

PR 模板见：

- `.github/pull_request_template.md`

合并纪律（强制）：

- 优先 `Squash and merge`（保持 `main` 历史干净）
- 合并完成后必须点击 `Delete branch`（保持远端干净）

不会操作 PR 时，不要“乱点”，按步骤执行：

- `docs/guides/standards/pull-request-howto.md`

## 5) 版本化与发布（后续扩展）

当前阶段不强制发布版本号，但必须保证：

- 契约变更可追溯（通过 PR + commit）
- schema 必须版本化（`v1/v2`），向后兼容优先
