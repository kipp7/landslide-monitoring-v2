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

## 6) PR 显示 “This branch has conflicts” 怎么办（必会）

### 6.1 最省事：用 GitHub 网页解决

当 PR 页面提示冲突：

1) 打开 PR 页面
2) 点击 `Resolve conflicts`（如果可用）
3) 解决冲突后 `Mark as resolved`
4) `Commit merge`（GitHub 会把冲突解决 commit 到你的分支）

适用场景：

- 你不熟悉命令行
- 网络导致本地 `git fetch/pull` 不稳定（见 INC-0006）

### 6.2 命令行解决（更可控）

1) 确保你在工作分支：

- `git checkout <your-branch>`

2) 拉取远端并合并 `main`：

- `git fetch origin`
- `git merge origin/main`

3) 按提示打开冲突文件，删除 `<<<<<<<` / `=======` / `>>>>>>>` 标记，并保留正确内容。

4) 提交并 push：

- `git add -A`
- `git commit -m "chore(repo): resolve merge conflicts"`
- `git push`

#### 6.2.1 add/add 冲突（双方都新增同一文件）

最常见于 “两边同时新增同名文档”：

- 选择保留一份权威内容（不要重复两份）
- 合并后确保引用入口（README/索引）只指向一份文件

案例复盘：`docs/incidents/INC-0005-github-rulesets-and-status-checks-setup.md`

## 7) 命令行推送失败（连接重置/超时）怎么办

症状：`git fetch/pull/push` 报 `Recv failure: Connection was reset`

处理：

- 优先切换 SSH remote（推荐）：见 `docs/incidents/INC-0006-git-https-connection-reset.md`
- 不要卡在命令行：可用 GitHub 网页完成 PR 创建/冲突解决/合并
