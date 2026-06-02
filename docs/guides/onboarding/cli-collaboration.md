---
title: cli-collaboration
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/onboarding/cli-collaboration
---

# CLI 协作指南

## 1. 目标

本指南用于让新的 CLI / Codex 协作者快速加入当前项目，并避免：

- 进错仓库
- 改错分支
- 重复做同一类任务
- 无序覆盖彼此改动

## 2. 当前唯一长期开发入口

后续长期开发代码统一放在：

- `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline`

不要把以下目录当作长期主线：

- `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2`
- `E:\学校\06 工作区\2\openharmony`
- `E:\学校\02 项目\99 山体滑坡优化完善\LAMv2_Desk`

它们分别只用于：

- 历史集成与本地运行态
- 只读参考
- 桌面端历史参考

## 3. 接入前必须先读的文档

### 项目入口

- `docs/README.md`

### 当前统一结论

- `docs/unified/unified-baseline-2026-03.md`
- `docs/unified/long-term-development-decision-2026-03.md`
- `docs/unified/data-closed-loop.md`

### 并发开发规则

- `docs/unified/concurrency-environment-2026-03.md`
- `docs/unified/task-queue.md`
- `docs/unified/conflict-resolution-playbook.md`
- `docs/unified/reports/README.md`
- `docs/unified/agent-briefs/README.md`
- `docs/journal/README.md`

## 4. 当前工作目录结构

### 主线仓

- `landslide-monitoring-v2-mainline`

### 并发工作树目录

- `landslide-monitoring-v2-mainline-worktrees\integration`
- `landslide-monitoring-v2-mainline-worktrees\platform-restore-check`
- `landslide-monitoring-v2-mainline-worktrees\desk-api-align`
- `landslide-monitoring-v2-mainline-worktrees\gnss-protocol`
- `landslide-monitoring-v2-mainline-worktrees\algo-inventory`

## 5. 每个协作者的入场动作

### 第一步：看任务队列

先打开：

- `docs/unified/task-queue.md`

确认：

- 哪些任务是 `ready`
- 哪些任务已经 `in_progress`
- 自己应该进入哪个工作树

### 第二步：进入指定工作树

只在分配给自己的工作树里工作，不跨目录乱改。

### 第三步：确认任务边界

进入任务前必须先明确：

- 目标
- 可改目录
- 禁止改目录
- 依赖谁
- 最终要交付什么

### 第四步：记录结论

完成后至少更新：

- 任务队列状态
- 对应任务报告 `docs/unified/reports/*.md`
- 对应专题文档
- `docs/journal/2026-03.md` 或当月日志

补充硬性要求：

- 先更新当前 worktree 的当月日记
- 若并行进展尚未回流主线，再同步主线当月日记
- 每次任务完成后，必须在当月日记追加 `CLI 最终输出原文` 小节
- `CLI 最终输出原文` 必须与终端里给用户的最终输出完全一致

## 6. 当前任务分工原则

- 一条工作树只做一类事情
- 文档和契约优先于实现代码
- 先合 `integration`，不直接往 `main` 堆

## 7. 推荐分工

### `platform-restore-check`

- 基础设施
- 服务恢复
- 最小闭环核查

### `desk-api-align`

- Desk ↔ 平台 API 对齐
- legacy `/api/*` 与 `/api/v1` 迁移建议

### `gnss-protocol`

- GNSS 资料收口
- 基线与设备协议字段统一

### `algo-inventory`

- 算法清点
- 卡片底稿

## 8. 禁止事项

- 不要在旧集成仓里继续作为正式开发主线改代码
- 不要直接在 `main` 上做实验性改动
- 不要同时改平台接口、Desk 页面、GNSS 字段且不留记录
- 不要在未更新任务队列时悄悄开始任务

## 9. 新协作者一句话规则

先看 `docs/unified/task-queue.md`，  
再进你的 worktree，  
只做你的任务，  
先合 `integration`。