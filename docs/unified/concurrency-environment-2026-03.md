---
title: concurrency-environment-2026-03
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/concurrency-environment-2026-03
---

# 并发环境准备结果（2026-03）

## 1. 目标

为后续 Codex 并发开发准备一套干净、可控、可收口的工作环境。

## 2. 已完成的环境准备

### 长期主线仓

- 路径：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline`
- 分支：`main`

### 并发工作树根目录

- 路径：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline-worktrees`

### 已创建的工作树

- `integration`
  - 路径：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline-worktrees\integration`
  - 分支：`integration`

- `desk-api-align`
  - 路径：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline-worktrees\desk-api-align`
  - 分支：`codex/desk-api-align`

- `platform-restore-check`
  - 路径：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline-worktrees\platform-restore-check`
  - 分支：`codex/platform-restore-check`

- `gnss-protocol`
  - 路径：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline-worktrees\gnss-protocol`
  - 分支：`codex/gnss-protocol`

- `algo-inventory`
  - 路径：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline-worktrees\algo-inventory`
  - 分支：`codex/algo-inventory`

## 3. 这套环境怎么使用

### `main`

- 只保留主线
- 不直接堆并发实验性修改

### `integration`

- 所有并发成果先合到这里
- 在这里集中解决冲突
- 验证通过后再考虑并入 `main`

### 专题工作树

- 每个工作树只承担一类主题
- 不混改
- 不跨多个目标顺手修

## 4. 并发任务命名含义

### `codex/platform-restore-check`

负责：

- 基础设施
- 服务源码
- 可运行性核查
- 平台恢复基础

### `codex/desk-api-align`

负责：

- Desk 所需接口清单
- legacy `/api/*` 与 v2 `/api/v1` 对齐
- Desk ↔ 平台接口联调策略

### `codex/gnss-protocol`

负责：

- GNSS 相关资料收口
- 设备协议、基线、形变相关字段统一

### `codex/algo-inventory`

负责：

- 现有算法、公式、阈值、验证方式清点
- 后续算法卡片体系的底稿

## 5. 冲突处理原则

- 先合文档和契约，再合实现代码
- 先解决共享字段与接口定义，再解决下游页面与服务逻辑
- 所有并发线先进入 `integration`，不直接互相覆盖

## 6. 推荐工作方式

### 日常协作

- 每次开新任务先在当前文档体系里确认任务边界
- 再进入对应工作树
- 完成后先合 `integration`

### 冲突解决

- 以统一文档为准
- 以平台主线契约为准
- 以长期主线仓为最终收口位置

## 7. 当前环境准备结论

当前已经具备：

- 干净的长期主线仓
- 独立的并发工作树
- 集成线
- 可以开始任务分配与并发推进的基本环境