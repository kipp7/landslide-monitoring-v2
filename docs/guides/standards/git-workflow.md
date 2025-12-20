# Git 工作流与推送规则（必须遵守）

目标：让仓库在 GitHub 上长期可维护，避免“乱推分支、误改主分支、提交不可追溯”。

配套必读（强制）：
- GitHub 仓库治理（分支保护/合并策略）：`docs/guides/standards/github-repo-governance.md`
- PR 操作指南（标题/描述/检查项）：`docs/guides/standards/pull-request-howto.md`

## 1) 分支策略（强制）

### 1.1 主分支（main）
- `main` 必须始终保持可用（门禁通过、可部署、可回滚）。
- 禁止直接向 `main` push（包含 AI 与人工）。
- 所有变更必须通过 Pull Request 合入。

### 1.2 工作分支（feature branches）
分支命名必须可读、可检索，推荐：
- `feat/<scope>-<short-desc>`：新增功能
- `fix/<scope>-<short-desc>`：修复问题
- `docs/<scope>-<short-desc>`：文档/契约调整
- `chore/<scope>-<short-desc>`：脚本/依赖/CI
- `refactor/<scope>-<short-desc>`：重构（行为不变或最小行为变化）

规则：
- 分支必须从 `main` 拉出：`git checkout -b <branch> origin/main`
- 一个 PR 尽量只解决一个主题（避免“巨石 PR”）。

## 2) 推送与合并规则（强制）

### 2.1 推送前检查（必须）
推送前必须确保门禁通过：
- `python docs/tools/run-quality-gates.py`

如修改了 OpenAPI：
- `python docs/tools/update-openapi-stamp.py`

### 2.2 合并方式（推荐）
GitHub 合并建议使用：
- Squash and merge（推荐）：保持 `main` 历史干净，每个 PR 对应一个 commit
- Rebase and merge：适合多人协作且保持线性历史

不建议：
- Merge commit（会产生历史噪音，除非团队明确需要）

### 2.3 Force push（禁止）
- 禁止对 `main` 做 force push。
- 对个人分支也不建议 force push（除非明确知道后果且 PR 尚未 review）。

### 2.4 本机双工作区规则（强制）
为避免“改错目录/提错目录”，本项目规定本机存在两个工作区时必须遵守：

- 参考工作区（只读）：`E:\学校\06 工作区\2\openharmony`
  - 只允许作为对照/查资料/回溯旧实现的来源。
  - 禁止在该目录内做任何会改变文件内容的操作（编辑、格式化、安装依赖写入、生成构建产物等）。
  - 禁止从该目录执行 `git commit` / `git push` / `gh pr ...`。
- 唯一可提交工作区（可写）：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2`
  - 所有变更、提交、推送、PR 都只允许在该目录发生。

#### 2.4.1 允许的工作方式（复制后修改）
当需要基于参考工作区的旧实现进行改造时：
1) 在参考工作区中定位文件（只读）。
2) 将需要改动的文件复制到可提交工作区中的对应路径。
3) 只在可提交工作区中进行修改、运行门禁、提交、推送。

说明：参考工作区是“源材料”，可提交工作区是“产出物”；参考工作区内容必须保持不变，避免污染与误提交。

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
- 中文或英文均可，但必须简洁可读，避免“update/modify”等无信息词。

### 3.2 提交粒度
- 允许多个 commit 推送到同一个 PR（便于 review）。
- 合并到 `main` 时推荐 squash（最终在 `main` 上保留 1 个 commit/PR）。

## 4) PR 规范（强制）
PR 必须包含：
- 变更说明（为什么做）
- 影响范围（docs/services/apps/infra）
- 门禁结果（至少说明已通过 `run-quality-gates`，并满足 `npm run lint` / `npm run build`）

模板见：
- `.github/pull_request_template.md`

合并纪律：
- 优先 Squash and merge
- 合并完成后删除分支（保持远端干净）

不会操作 PR 时不要“乱点”，按步骤执行：
- `docs/guides/standards/pull-request-howto.md`

## 5) 版本化与发布（后续扩展）
当前阶段不强制发布版本号，但必须保证：
- 契约变更可追溯（通过 PR + commit）
- schema 必须版本化（`v1/v2`），优先向后兼容

