# INC-0005: GitHub Rulesets 配置与 Required Status Checks 选择困难（含 422 修复）

## Summary

在开启仓库治理（Rulesets）过程中，出现以下问题：

- GitHub 新版界面中，无法找到旧版 Branch protection 的勾选项（禁强推/禁删除/限制推送等）。
- `Required status checks` 下拉中找不到 `quality-gates` 或任何 “docs” 相关项。
- 试图通过 REST API 创建 ruleset 时，出现 `422 Invalid request`（例如 `Invalid property /rules/0` 或 `/rules/1`）。
- PowerShell 中对象字段访问方式不一致（`.type` / `$_['type']`），导致误以为规则未写入。

最终通过 **Rulesets API + 必填参数补齐 + 以 check context 名强制** 的方式解决，并完成可验证闭环。

## Impact

- 无法在仓库层面强制 PR-only、必过 CI、禁强推/禁删除，导致 `main` 分支存在“误操作风险”。
- 团队（含 AI）在提交/合并策略上无法被平台强制约束，容易破坏工程闭环。

## Timeline（简化）

- T0：进入 `Settings → Rules → Rulesets`，尝试创建 `main` ruleset，但 UI 找不到 “docs”/`quality-gates`。
- T1：尝试用 REST API 创建 ruleset，收到 422（规则结构不符合 schema）。
- T2：确认 GitHub Actions 已在 `main` 上跑过且 job 名为 `docs-and-contracts`。
- T3：补齐 `pull_request` 规则的必填 parameters，并按 `required_status_checks` 的 schema 写入 `docs-and-contracts`。
- T4：创建 ruleset 成功，使用 API 与实际行为（PR-only）完成验证。

## Root Cause

1) **UI 版本差异**

- 新版 GitHub 将旧版 “Branch protection” 的选项分散/迁移到 `Rulesets`，路径与名称不同，导致“按旧教程找不到”。

2) **Status check 名称误解**

- “Required status checks” 里显示的通常是 **check context**（常见为 Actions job 名），而不是 workflow 文件名。
- 本仓库 `.github/workflows/quality-gates.yml` 的 workflow 名是 `quality-gates`，但实际 check context 是 `docs-and-contracts`。

3) **Rulesets API schema 必填字段缺失**

- `pull_request` 规则要求多项参数为 required；未提供就会 `422 Invalid property /rules/0`。
- `required_status_checks` 规则的参数结构必须满足 schema（含数组与 strict 策略）。

4) **PowerShell 对返回 JSON 的类型解析差异**

- 直接用 `.type` / `$_['type']` 取值在不同 PowerShell/对象类型下表现不同。
- 稳定方法是对对象做 `ConvertTo-Json` 后再检查结构与关键字段。

## Resolution

### A. 先确认 check context（必须）

1) 打开 GitHub Actions 页面，确认 `main` 分支最近一次 `quality-gates` 是绿色。
2) 通过 API 获取 `main` 最新 commit 的 check runs（PowerShell 示例）：

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

预期：出现 `docs-and-contracts`，且 `conclusion=success`。

### B. 用 Rulesets API 创建/更新 ruleset（推荐方式）

关键点：

- `pull_request` 参数必须补齐 required 字段（即便设为 `false/0` 也要提供）。
- `required_status_checks.parameters.required_status_checks` 必须是非空数组，并写入 `context: docs-and-contracts`。
- 还应开启：`non_fast_forward`（禁强推）、`deletion`（禁删除）。

本仓库落地的规则示例（rules JSON）：

```json
[
  {
    "type": "pull_request",
    "parameters": {
      "allowed_merge_methods": ["squash"],
      "dismiss_stale_reviews_on_push": false,
      "require_code_owner_review": false,
      "require_last_push_approval": false,
      "required_approving_review_count": 0,
      "required_review_thread_resolution": true
    }
  },
  {
    "type": "required_status_checks",
    "parameters": {
      "strict_required_status_checks_policy": true,
      "do_not_enforce_on_create": false,
      "required_status_checks": [{ "context": "docs-and-contracts" }]
    }
  },
  { "type": "non_fast_forward" },
  { "type": "deletion" }
]
```

### C. 稳定验证方式（不依赖 UI）

1) 行为验证：尝试在 GitHub 页面直接编辑 `main` 的文件 → 应被强制创建分支并走 PR。
2) API 验证：拉取 ruleset 并检查 rules JSON：

```powershell
$r = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/kipp7/landslide-monitoring-v2/rulesets/<RULESET_ID>" -Headers $headers
$r.rules | ConvertTo-Json -Depth 50
```

预期：包含 `required_status_checks.parameters.required_status_checks[0].context = "docs-and-contracts"`。

## Prevention

- 把 “仓库治理配置”写入标准文档并固化验证步骤：
  - `docs/guides/standards/github-repo-governance.md`
- 将“Required status checks 的真实名称”写清楚并提供 API 验证方案：
  - 本仓库应要求 `docs-and-contracts`（Actions job 名）

## Follow-ups

- 如果命令行经常无法访问 GitHub（`Recv failure: Connection was reset`），请参考：
  - `docs/incidents/INC-0006-git-https-connection-reset.md`

