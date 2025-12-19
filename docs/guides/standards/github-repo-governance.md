# GitHub 仓库治理（企业化约束，必须落地）

目标：把“高质量/高规范/不乱推送”从口头约定变成 **GitHub 设置强制**，避免单人/多人协作时主分支失控。

适用范围：本仓库 `landslide-monitoring-v2`（以及未来复用到其他项目）。

## 1) 必须达成的治理目标（Checklist）

- `main` 永远可用：随时可部署/可回滚。
- **禁止**直接 push 到 `main`：所有变更必须走 PR。
- PR 必须通过 CI 质量门禁：见 `docs/guides/standards/quality-gates.md`。
- 合并策略一致：推荐 **Squash merge**，保证历史干净可追溯。
- 关键契约变更可追溯：OpenAPI/Schema/DDL 都必须经由 PR。

## 2) 分支保护（Branch protection）设置步骤（强制）

GitHub 页面路径：

1) 进入仓库主页  
2) `Settings` → `Branches`  
3) `Branch protection rules` → `Add rule`  
4) `Branch name pattern` 填：`main`  

建议勾选（按优先级，尽量全开）：

### 2.1 PR 合并强制（必须）

- 勾选 `Require a pull request before merging`
  - 建议同时勾选 `Require conversation resolution before merging`（讨论必须解决）

### 2.2 CI 门禁强制（必须）

- 勾选 `Require status checks to pass before merging`
  - 勾选 `Require branches to be up to date before merging`
  - 在 status checks 中选择：`docs-and-contracts`（对应 `.github/workflows/quality-gates.yml` 的 job 名）

说明：

- 这会强制每个 PR 必须通过 `python docs/tools/run-quality-gates.py`，否则不能合并。
- **常见坑**：GitHub 的 “status check 名称”通常是 *workflow 的 job 名*，不是 workflow 文件名或 `name:`。
  - 本仓库 workflow 名为 `quality-gates`，但实际可选的 check 往往显示为 `docs-and-contracts` 或 `quality-gates / docs-and-contracts`。
- **如果列表里找不到**：先确保 `main` 上至少跑过一次 Actions（有一次绿色记录），GitHub 才会把它出现在可选列表里。

### 2.3 历史与强推（强烈建议）

- 勾选 `Require linear history`（线性历史）
- 勾选 `Restrict who can push to matching branches`（限制谁能 push 到 main）
- 勾选 `Do not allow force pushes`（禁止强推）
- 勾选 `Do not allow deletions`（禁止删除 main）

如果你在 `Branches` 页面找不到上述选项，可能是 GitHub 新版界面启用了 `Rulesets`（规则集）：

- 入口：`Settings` → `Rules` → `Rulesets`
- 在 ruleset 中对 `main` 设置：
  - `Require a pull request`
  - `Require status checks`（选择 `docs-and-contracts`）
  - 禁止 force-push / 禁止删除 / 限制推送（对应规则项名称可能略有差异）

> 实战结论：如果你看到 `Settings → Rules → Rulesets`，优先用 **Rulesets**，不要纠结旧版 Branch protection 教程。

## 2.5 Rulesets（新版推荐做法，强制）

页面路径：

1) `Settings` → `Rules` → `Rulesets`
2) `New ruleset` → `New branch ruleset`
3) `Enforcement status` 选 `active`
4) `Target branches` 选择 `main`（pattern: `refs/heads/main` 或 UI 的 `main`）

建议开启的 rules（与本仓库治理目标对齐）：

- `pull_request`：强制 PR-only，并要求 review 讨论已解决
- `required_status_checks`：强制 CI 门禁（本仓库应选择 `docs-and-contracts`）
- `non_fast_forward`：禁止 force push
- `deletion`：禁止删除 `main`

### 2.6 Required status checks 的“正确名称”怎么找（必须掌握）

常见误区：在 UI 里找 `quality-gates`/“docs”是找不到的。

本仓库的真实 check context 是 `docs-and-contracts`（Actions job 名），不是 workflow 文件名。

稳定确认方式（PowerShell，推荐）：

```powershell
$headers = @{
  Authorization = "Bearer $env:GITHUB_TOKEN"
  Accept        = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
}

$sha = (Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/kipp7/landslide-monitoring-v2/commits/main" -Headers $headers).sha
$runs = (Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/kipp7/landslide-monitoring-v2/commits/$sha/check-runs" -Headers $headers).check_runs
$runs | Select-Object name, status, conclusion
```

## 6.1 常见问题与修复入口（强制阅读）

- Rulesets/UI/422 错误/PowerShell 解析差异：`docs/incidents/INC-0005-github-rulesets-and-status-checks-setup.md`
- Git 命令行访问 GitHub 连接重置：`docs/incidents/INC-0006-git-https-connection-reset.md`
- DockerHub 拉镜像超时：`docs/incidents/INC-0004-dockerhub-pull-timeout.md`

### 2.4 管理员也受约束（建议）

- 勾选 `Include administrators`

这样可以避免“我只是临时改一下”导致纪律被破坏。

## 3) 合并策略（Merge method）设置（强制）

GitHub 页面路径：

1) `Settings` → `General`  
2) `Pull Requests` → `Merge button`  

建议：

- 仅启用 `Squash merging`（推荐）
- 关闭 `Merge commits`
- （可选）关闭 `Rebase merging`，避免新手误操作导致历史变复杂

原因：

- Squash 可以让 `main` 上每个 PR 对应一个 commit，最利于回滚与审计。

## 4) CODEOWNERS（可选：多人协作前启用）

说明：`CODEOWNERS` 可以让“关键目录变更”必须被指定人员 review。

单人阶段可以先不强制；多人阶段建议启用：

- 新增文件：`.github/CODEOWNERS`
- 规则示例（仅示意）：`* @kipp7`

注意：

- 如果你开启了 “Require review from Code Owners”，但又没有可用 reviewer，会导致 PR 无法合并；单人阶段请谨慎开启。

## 5) 仓库安全设置（建议）

路径：`Settings` → `Code security and analysis`

建议开启：

- `Dependabot alerts`（依赖漏洞提醒）
- `Secret scanning`（如果可用）

并配合本仓库已有门禁：

- `docs/tools/scan-secrets.py`（CI 会跑）

## 6) 治理规则的变更方式（强制）

任何治理规则的变更必须：

- 先改文档：`docs/guides/standards/`（说明为什么要改）
- 再改 GitHub Settings
- 开 Issue 记录：原因、变更点、影响范围、回滚方式
