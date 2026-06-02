---
title: Repository Organization And Push Plan
type: guide
permalink: landslide-monitoring-v2-mainline/docs/guides/repository-management/repository-organization-and-push-plan
---

# 仓库整理与推送方案

## 1. 当前主线边界

本项目当前主力交付版本是 Windows 桌面端，不是 Web 端，也不是旧桌面仓库。

默认开发、提交、验证和交付入口固定为：

- `apps/desk/`：桌面端前端业务 UI。
- `apps/desk-win/`：Windows WebView2 原生壳。
- `artifacts/desk-win/latest/`：正式桌面端交付基线。
- `artifacts/desk-win/latest-cloud/`、`artifacts/desk-win/latest-cloud.zip`：云端直连桌面端交付包。
- `docs/unified/reports/desk-win-delivery-index-latest.md`：桌面端交付索引。
- `docs/unified/reports/desk-win-production-handoff-latest.md`：桌面端交接说明。

以下内容不是当前默认主线：

- `apps/web/`：只在明确要求 Web 管理端时处理。
- `apps/mobile/`：只在明确要求移动端时处理。
- 父目录 `LAMv2_Desk/`：历史旧桌面仓库，保留参考，不合并为当前主线。
- 父目录 `remote-inspect/`：远端检查/临时克隆残留，默认不作为项目源。
- `.tmp/`：实验、下载、数据处理缓存，不进普通 Git。
- `artifacts/desk-win/milestones/`、`artifacts/desk-win/delivery/` 等旧交付包：默认归档或清理，不作为当前唯一交付版本。

## 2. 当前盘点结论

盘点日期：2026-06-02。

父目录：`E:\学校\02 项目\99 山体滑坡优化完善`。

主要仓库：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline`。

远端：`https://github.com/kipp7/landslide-monitoring-v2.git`。

当前分支：`main`。

远端同步状态：`HEAD...origin/main = 0 ahead / 0 behind`。

主仓库空间占用约 `38.96GB`，主要来源：

- `.tmp/`：约 `20.74GB`，主要是区域模型库、降雨/土地覆盖/事件 replay 等原始数据和中间产物。
- `artifacts/`：约 `13.81GB`，主要是桌面端交付包、历史 milestone、模型产物和报告。
- `apps/`：约 `1.41GB`，其中包含源码和部分构建/依赖产物。
- `.git/`：约 `0.88GB`，存在较多 loose objects，后续可以做安全维护。
- `.tools/`：约 `0.84GB`，主要是本地记忆/向量库工具缓存。
- `node_modules/`：约 `0.81GB`，可重装，不应进 Git。

当前工作区变更规模较大：

- 总计约 `1146` 条 Git 状态记录。
- modified 约 `514`。
- untracked 约 `616`。
- added 约 `8`。
- deleted 约 `8`。

这说明当前不适合直接 `git add . && git commit && git push`，必须分批提交。

## 3. Git 提交边界

### 必须优先提交

这些内容属于项目长期资产，应该进入 Git：

- 桌面端源码：`apps/desk/`、`apps/desk-win/`。
- 后端服务源码：`services/`。
- 公共库：`libs/`。
- 开发脚本：`scripts/dev/`、`scripts/deploy/`。
- 项目文档：`docs/`。
- OpenSpec 变更：`openspec/`。
- 项目记忆的文本记录：`memory/`。
- 根目录项目规范：`AGENTS.md`、`CURRENT-TARGET.md`、`WORKSPACE.md`、`WORKFLOWS.md`、`README.md`。
- 锁文件和配置：`package.json`、`package-lock.json`、`tsconfig.base.json`、`eslint.config.cjs` 等。

### 默认不提交

这些内容不应进入普通 Git 历史：

- `.tmp/`。
- `node_modules/`。
- `.tools/`。
- `.bm-state/`。
- `.playwright-mcp/`。
- `.context/`。
- `.venv/`、`venv/`。
- `*.db`、`*.sqlite`、`*.sqlite3`。
- `*.log`。
- 大型下载包、压缩包、临时 zip、rar。
- 旧交付包全集。

### 可选择 Git LFS

仅在这些文件确实要跟随项目版本时才使用 Git LFS：

- 小规模但关键的模型文件。
- 最终论文/比赛材料里必须复现的少量数据切片。
- 必须长期保留的正式交付包，例如某个最终版 `latest-cloud.zip`。

不建议用 Git LFS 保存：

- `.tmp/regional-model-library/raw/` 全量原始数据。
- 多版本历史交付包全集。
- 可重新下载或重新构建的依赖、缓存、临时产物。

## 4. 密钥备份策略

当前发现：`key/1.pem` 是未跟踪文件，没有进入 Git。

虽然仓库是私有仓库，也不建议把真实密钥明文提交进普通 Git 历史。原因不是“现在会泄露”，而是未来很容易出现这些问题：

- 仓库被误转公开。
- 后续邀请协作者时忘记历史里有密钥。
- 密钥进入 Git 历史后，即使删除文件，历史中仍可恢复。
- GitHub 可能触发 secret scanning 或封禁相关凭据。

推荐方案：

1. 建立 `secrets/README.md`，只记录密钥用途、生成日期、对应服务、恢复方式，不写真实密钥内容。
2. 将真实密钥打包成 zip 或 tar。
3. 使用 GPG、age、7-Zip AES-256 或密码管理器导出文件加密。
4. 只把加密后的密钥包提交到私有仓库，例如 `secrets/landslide-keys-20260602.age`。
5. 解密密码不要写入同一个仓库，可放密码管理器、纸质记录或另一个独立私有备份。

如果为了极限省事，也可以明文提交，但需要接受一个后果：后续一旦仓库外泄或转公开，应立即轮换服务器 SSH key、云平台 token、数据库密码和所有相关凭据。

## 5. 本地空间清理优先级

清理原则：先移动/归档，后删除；先删可再生成产物，后动唯一数据。

### 第一优先级：可再生成产物

这些最适合清理，风险低：

- `node_modules/`：可通过 `npm install` 恢复。
- `apps/**/bin/`、`apps/**/obj/`：.NET 构建产物，可重新构建。
- `dist/`、`build/`、`.next/`：前端构建产物，可重新构建。
- `.playwright-mcp/`：浏览器调试日志/截图缓存。
- `.bm-state/`、`.tools/`：本地工具缓存，可按需备份后清理。

### 第二优先级：旧交付包

这些占用大，但要先保留当前正式版本：

保留：

- `artifacts/desk-win/latest/`。
- `artifacts/desk-win/latest-cloud/`。
- `artifacts/desk-win/latest-cloud.zip`。
- `artifacts/desk-win/CURRENT-BASELINE.md`。
- 最新交付索引和 hash 报告。

可归档或删除：

- `artifacts/desk-win/milestones/` 旧版本。
- `artifacts/desk-win/delivery/` 旧版本。
- 多个 `latest-cloud-fixed-*` 临时版本。
- 重复的历史 zip 包。

### 第三优先级：`.tmp/regional-model-library`

这是最大空间来源，但也是最容易包含唯一数据的目录，不能一刀切删除。

建议处理方式：

- 保留脚本、索引、manifest、实验摘要。
- 对原始下载数据建立文件清单，包括文件名、大小、来源 URL/DOI、下载日期、sha256。
- 对已能重新下载的数据，只保留清单，不保留全量文件。
- 对难以重新下载或人工购买的数据，压缩归档到外部硬盘/网盘/对象存储，不进普通 Git。
- replay pack 只保留关键小样本或最终实验版本，其余归档。

## 6. 推荐提交顺序

不要一次性提交全部变更。建议按下面顺序分批：

1. `chore(repo): record repository organization plan`

提交本文件、仓库管理 README、必要 `.gitignore` 修正。

2. `docs: sync project memory and handoff notes`

提交 `docs/`、`memory/`、`openspec/` 中已经确认要保留的文字资料。

3. `feat(desk): consolidate desktop client cloud and mock mode behavior`

提交桌面端主线相关源码：`apps/desk/`、`apps/desk-win/`。

4. `feat(edge): add rk3568 field alarm and hermes supervision services`

提交 RK3568/Hermes/告警联动相关服务：`services/`、`scripts/deploy/`、`scripts/dev/`。

5. `chore(data): add dataset manifests without raw payloads`

只提交数据清单和复现脚本，不提交原始数据。

6. `chore(secrets): add encrypted key backup manifest`

只提交加密密钥包和说明，不提交明文 `.pem`。

## 7. 推送前检查

每次提交前至少执行：

```powershell
git status --short
npm run build --workspace landslide-monitor-desk
```

如果涉及后端服务，再补充对应服务的 build/test。

推送前检查大文件：

```powershell
git diff --cached --name-only
git diff --cached --stat
git status --short
```

如果要确认暂存区是否有大文件，可执行：

```powershell
git diff --cached --name-only | ForEach-Object {
  if (Test-Path $_) {
    $item = Get-Item $_
    if ($item.Length -gt 20MB) { "$([math]::Round($item.Length/1MB,1)) MB`t$_" }
  }
}
```

## 8. 当前建议执行路径

当前最稳的执行路径：

1. 不碰父目录其他仓库，先只整理 `landslide-monitoring-v2-mainline`。
2. 先提交本仓库管理文档。
3. 生成 `.tmp` 和 `artifacts` 的文件清单，不提交原始大文件。
4. 将 `key/1.pem` 加密成备份包，再决定是否提交加密包。
5. 分批提交桌面端、边缘服务、文档、脚本。
6. 推送 `main` 到当前 GitHub 私有仓库。
7. 推送完成后，再执行本地空间清理：先清 `node_modules`、旧交付包、工具缓存，再处理 `.tmp`。

## 9. 一句话原则

桌面端是当前主力版本，Git 仓库保存“源码、文档、脚本、可复现清单和少量最终交付物”；本地大数据和历史构建产物通过归档/加密/LFS 管理，不把整个工作目录塞进普通 Git。
