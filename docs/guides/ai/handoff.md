# AI 交接指南（换窗口/换模型/换 AI 的“自解释”入口）

目标：避免依赖聊天记录；任何新 AI/新同事只读仓库就能定位“做到哪一步、下一步做什么、有哪些强约束”。

## 1) 交接的单一事实源（Single Source of Truth）
不要靠“记忆”或“全局搜索”，按仓库权威入口走：

1) **当前进度与下一步**：`docs/guides/roadmap/project-status.md`
2) **大局与决策（Why）**：`docs/architecture/`（ADR）
3) **需求与验收（What）**：`docs/features/`
4) **契约（Interface，唯一权威）**：`docs/integrations/`
5) **规范与流程（How-to）**：`docs/guides/standards/`
6) **历史问题与坑**：`docs/incidents/`

## 1.1) 当前进度快照（只写“事实 + 下一步”，不写实现细节）
- 以 `docs/guides/roadmap/project-status.md` 为准：当前里程碑已推进到 **Stage 5 完成**（单机 Compose 闭环 + 回归基线沉淀）。
- 当前重点：推进 “Next Actions #3：Web/App 去硬编码，仅依赖 v2 API/字典渲染”，硬件真机联调延后（设备暂时不可联调）。
- 当前迁移分支：`feat/v2-monorepo-migration`（详见 `project-status.md` 的 TL;DR 与 PR 链接）。

## 1.2) 本地工作区约束（非常重要）
本机存在多个同一远端的克隆目录，必须避免“改错目录/提错目录”：

- **唯一允许提交/推送/发 PR 的工作目录**：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2`
- `E:\学校\06 工作区\2\openharmony` 仅作为**参考/对照**目录（只读使用），不要在该目录产生提交、不要从该目录推送。

说明：如果需要对比/复刻旧实现，允许从参考目录读取，但最终变更必须落在“允许提交”的工作目录中。

## 2) 新 AI 接手时必须做的 7 步（强制）
1) 读：`docs/README.md`
2) 读：`docs/guides/roadmap/project-status.md`
3) 读：`docs/guides/standards/README.md`
4) 读：`docs/integrations/README.md`
5) 看最近变更：`git log -20 --oneline`
6) 跑本地门禁（确认环境正常）：`python docs/tools/run-quality-gates.py`
7) 开始工作前先写“计划范围”，明确 In/Out，避免越界（不扩大范围、不改既定技术栈）。

## 2.1) PR-only 合并与自动化
仓库 Rulesets 已启用：**禁止直接 push/merge 到 `main`，必须走 PR**，且 required checks 全绿才能合并。

推荐路径（最稳）：
1) 在 PR 页面启用 `Auto-merge (Squash)`
2) 等 required checks 全绿后自动合并

如需命令行（前提：本机已安装并登录 `gh`）：
- 检查：`gh auth status`
- 启用自动合并：`gh pr merge <PR号> --auto --squash --delete-branch`

## 3) 交接时必须同步更新哪些文档（强制）
- 合并任何影响“里程碑/下一步/关键约束”的 PR 后：必须更新 `docs/guides/roadmap/project-status.md`
- 修改任何契约（API/MQTT/Kafka/Rules/Storage）：必须更新 `docs/integrations/`，并通过 `python docs/tools/run-quality-gates.py`
- 踩到新坑：必须新增/更新 `docs/incidents/`

## 4) 推送前门禁（必须）
- `python docs/tools/run-quality-gates.py`
- `npm run lint`
- `npm run build`

## 5) 常见误区（必须避免）
- 没读 `project-status.md` / `integrations/` 就直接开写
- 未经 ADR 改技术路线/数据模型/事件模型
- 在 `apps/` 里硬编码传感器字典/阈值/单位（应通过 v2 API/字典表渲染）
- 把调试产物提交进仓库（`backups/**` 仅证据留存，必须被忽略）

