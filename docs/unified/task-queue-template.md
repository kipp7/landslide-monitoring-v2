---
title: task-queue-template
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/task-queue-template
---

# 任务队列模板

## 状态定义

- `ready`
- `in_progress`
- `blocked`
- `ready_for_integration`
- `integrated`
- `archived`

## 队列表

| 优先级 | 任务ID | 状态 | 工作树 | 主题 | 依赖 | 输出物 |
|---|---|---|---|---|---|---|
| P0 | `example-task` | `ready` | `example-worktree` | 简述 | 无 | 文档 / 代码 / 清单 |