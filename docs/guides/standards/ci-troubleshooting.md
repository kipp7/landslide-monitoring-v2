---
title: CI 常见问题排查（Troubleshooting）
---

# CI 常见问题排查（Troubleshooting）

本文是“质量门禁/PR 合并”相关问题的一站式排查入口，用于避免重复踩坑。

适用范围：

- GitHub Actions（`quality-gates` / `docs-and-contracts`）
- 本地质量门禁：`python docs/tools/run-quality-gates.py`
- Node/TypeScript：`npm run lint`、`npm run build`

## 0) 原则（先看这个）

- 先本地复现，再修：不要靠“点点点”赌 CI 会绿。
- 不要为了过门禁去放宽规则：优先修代码/契约/文档；确需调整规则时必须写清 Why（并记录到 PR 描述与 `docs/incidents/`）。
- 所有问题都要“可复现 + 可验证”：给出命令、输出摘要、修复方式。

## 1) 最快的定位路径（5 分钟内）

1) 打开 PR 的 Checks（检查）页，确定失败的 Job/Step 名称。
2) 本地跑同样的命令（优先跑最小集）：
   - `python docs/tools/run-quality-gates.py`
   - `cd services/api; npm run lint`
   - `cd services/api; npm run build`
3) 如果本地能复现：
   - 修复代码/文档 → 重新跑同样命令 → 确认通过 → 再 push。
4) 如果本地不能复现：
   - 记录环境差异（Node 版本、Python 版本、系统、依赖锁文件变化）
   - 参考 `docs/incidents/` 的相似案例，必要时补充新的 Incident。

## 2) 常见失败与解决办法

### A. `FAILED: openapi stamp`

现象：

- Checks 报错：`FAILED: openapi stamp`

原因：

- OpenAPI 文件有更新，但未同步更新 stamp（占位门禁，用于提醒“契约变更必须显式处理”）。

解决：

- 本地执行：`python docs/tools/update-openapi-stamp.py`
- 重新跑：`python docs/tools/run-quality-gates.py`

补充：

- 这是临时门禁；后续会被真实的 API client/DTO codegen 替代（仍需保持“契约变更必须可追踪”）。

### B. `contract validation` 失败

现象：

- Checks 报错：`Contract validation failed`

原因：

- `docs/integrations/` 下的契约（MQTT/Kafka/API/Storage）不符合约束（格式/必填字段/示例不合法等）。

解决：

- 直接按报错提示定位到具体文件/字段修复。
- 本地复验：`python docs/tools/validate-contracts.py`

### C. “必须更新项目状态页（project status gate）”失败

现象：

- Checks 报错：`FAILED: project-status update required but missing.`

触发条件（设计如此）：

- PR 修改了关键目录（`services/`、`infra/`、`apps/`、`libs/`、`docs/integrations/`、`docs/architecture/`），但没有同步更新交接入口：
  - `docs/guides/roadmap/project-status.md`

解决：

- 在同一个 PR 中补充 3~8 行“事实性更新”即可：
  - 当前阶段（Stage/Milestone）
  - 本次 PR 做了什么改变（1~3 条）
  - 下一步动作（1~3 条）

目的：

- 防止对话中断/换模型后“没有人知道做到哪一步”，确保接手成本可控。

### D. ESLint 报错（TypeScript）

现象示例（我们曾遇到过）：

- `@typescript-eslint/prefer-optional-chain`
- `@typescript-eslint/restrict-template-expressions`
- `no-useless-escape`

解决思路：

1) 先尝试自动修复：
   - `cd services/api; npm run lint -- --fix`
2) 如果无法自动修复，按规则意图改代码：
   - `prefer-optional-chain`：把 `a && a.b` 改成 `a?.b`
   - `restrict-template-expressions`：模板字符串里不要直接拼 `number/boolean` 等，显式转字符串：`${String(n)}` 或使用普通拼接/格式化
   - `no-useless-escape`：字符串里不必要的 `\\\"` 删除，或改用单引号/模板字符串
3) 复验：
   - `cd services/api; npm run lint`

### E. Docker 拉镜像超时（DockerHub pull timeout）

现象：

- `docker pull` / `docker compose up` 过程卡住或超时。

解决（可选项按优先级）：

- 参考复盘：`docs/incidents/INC-0004-dockerhub-pull-timeout.md`
- 优先使用国内镜像加速（Docker Desktop 的镜像设置）
- 尽量避免在高峰期大量拉取大镜像；必要时预拉取并缓存

### F. GitHub Rulesets / Required checks 找不到或 422

现象：

- UI 找不到 “required checks”
- 调 REST API 创建 ruleset 报 422

解决：

- 参考复盘：`docs/incidents/INC-0005-github-rulesets-and-status-checks-setup.md`
- 注意：GitHub 新版是 Rulesets，很多选项位置已变化

## 3) 出现新问题时，必须补全什么？

- 复现步骤（命令 + 环境）
- 失败输出（关键 10~30 行）
- 根因分析（Why）
- 修复方案（How）
- 验证方式（How to verify）

对应落点：

- 一次性坑：写到 `docs/incidents/INC-xxxx-*.md`
- 长期规范：补到 `docs/guides/standards/` 的对应规范文档

