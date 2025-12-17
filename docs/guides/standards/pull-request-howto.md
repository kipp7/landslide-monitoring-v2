# Pull Request 操作指南（新手友好，必须按此执行）

目标：确保每次合并都“闭环”：有说明、有验证、有回滚、有证据，不再出现“点一下就红了/不知道怎么修”的情况。

## 0) 前置条件（强制）

- 你已经从 `main` 拉出分支（不要在 `main` 上改）
- 本地门禁通过：`python docs/tools/run-quality-gates.py`
- 你知道本次变更的范围：docs / infra / services / apps

## 1) 本地提交（最小闭环）

1) 查看当前分支：
   - `git branch --show-current`
2) 查看变更：
   - `git status`
   - `git diff`
3) 暂存与提交：
   - `git add -A`
   - `git commit`（会使用 `.github/commit-message-template.txt`）
4) 推送分支：
   - `git push -u origin HEAD`

## 2) 在 GitHub 创建 PR（页面操作）

进入仓库：

- `https://github.com/kipp7/landslide-monitoring-v2`

推荐入口（最不容易出错）：

1) 点击顶部 `Pull requests`
2) 点击右侧 `New pull request`
3) Base 选择：`main`
4) Compare 选择：你的分支（例如 `chore/chinese-templates`）
5) 点击 `Create pull request`

### 2.1 标题怎么写（强制）

标题用中文也可以，推荐与 commit 格式一致：

- `docs(standards): 增加语言政策与文档写作规范`
- `chore(infra): 单机 compose 增加健康检查脚本`
- `feat(api): 新增设备注册接口`

规则：

- 必须能一眼看出“改了什么”和“影响范围”
- 禁止 “update/modify/调整一下” 这类无信息标题

### 2.2 内容怎么填（强制）

PR 内容必须包含：

- 背景与目标（Why）
- 变更内容（What）
- 验证方式（Verification）：至少写 `python docs/tools/run-quality-gates.py` 已通过
- 风险与回滚（Risk/Rollback）：至少说明 “revert 本 PR”

仓库已有模板会提示你填写：

- `.github/pull_request_template.md`

## 3) CI 变红了怎么办（最常见）

### 3.1 OpenAPI stamp 失败

现象：CI 报 `FAILED: openapi stamp`

处理：

- 本地运行：`python docs/tools/update-openapi-stamp.py`
- 再运行：`python docs/tools/run-quality-gates.py`
- 提交并 push

### 3.2 契约校验失败（schema/examples 不一致）

处理：

- 本地运行：`python docs/tools/validate-contracts.py`
- 根据报错修正：
  - 示例字段名/类型/枚举
  - JSON Schema 约束
  - OpenAPI 与文档不一致

### 3.3 secrets 扫描失败

处理：

- **立刻删除**敏感内容（不要尝试“掩码一下”）
- 使用 `env.example` + `.env`（不要提交 `.env`）
- 如已推送到远端：立刻开 Incident 复盘（见 `docs/incidents/`）

## 4) 合并 PR（强制 Squash）

当 CI 全绿后：

1) 在 PR 页面点击 `Squash and merge`
2) 合并说明用中文写清楚（建议沿用 PR 模板摘要）
3) 合并完成后点击 `Delete branch`（保持远端干净）

## 5) 合并后同步本地（避免分叉）

1) 切回 main：
   - `git checkout main`
2) 拉取最新：
   - `git pull --ff-only`
3) 清理本地已合并分支（可选）：
   - `git branch -d <branch>`

