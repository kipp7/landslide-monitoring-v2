---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-command-acked-notification-policy/tasks
---

## 1. Spec And Contract
- [x] 1.1 明确 `COMMAND_ACKED` 通知策略为“默认静默、按命令显式开启”
- [x] 1.2 定义命令创建/查询契约中的 `notifyOnAck` 字段与默认值
- [x] 1.3 定义开启 `notifyOnAck` 时命令通知 API 的可见行为

## 2. Data And Runtime
- [x] 2.1 为 `device_commands` 增加持久化字段，用于保存 acked 通知策略
- [x] 2.2 调整 API 创建/查询命令逻辑，读写该字段
- [x] 2.3 调整 `command-notify-worker`，让 `COMMAND_ACKED` 仅在显式开启时创建通知

## 3. Proof And Docs
- [x] 3.1 保留现有 “acked 默认不通知” proof，作为默认行为回归
- [x] 3.2 新增 “acked 显式开启后会通知” proof
- [x] 3.3 更新 field rehearsal 入口文档、phase summary 与月记