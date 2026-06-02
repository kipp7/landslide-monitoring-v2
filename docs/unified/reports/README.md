---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/readme
---

# 共享汇报区

## 目标

本目录用于让不同 CLI / Codex 窗口把阶段性结果写入共享文件。

这样做的目的：

- 总协调器可以直接读取各窗口最新进展
- 不依赖聊天窗口上下文转述
- 保留阶段性结论与冲突记录
- 便于后续集成与复盘

## 使用规则

- 每个任务对应一份固定报告文件
- 不要每次新建随机文件名
- 始终更新同一个任务报告文件
- 阶段性进展、阻塞、结论都写进去

## 当前任务报告文件

- `docs/unified/reports/platform-restore-check.md`
- `docs/unified/reports/desk-api-align.md`
- `docs/unified/reports/gnss-protocol.md`
- `docs/unified/reports/algo-inventory.md`

## 汇报格式

每次更新至少补这几项：

- 当前时间
- 当前任务
- 本轮阅读了哪些文件
- 本轮做了什么
- 当前结论
- 改了哪些文件
- 是否有冲突或阻塞
- 是否可进入 `integration`
- 下一步建议

## 注意

- 报告写事实，不写空话
- 若改动超出原任务边界，必须在报告里显式说明
- 若和其他任务有冲突，必须写明冲突对象与原因