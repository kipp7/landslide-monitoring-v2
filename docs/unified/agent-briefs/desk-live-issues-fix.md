---
title: desk-live-issues-fix
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/agent-briefs/desk-live-issues-fix
---

# 任务简报：desk-live-issues-fix

## 当前状态

- 第四轮任务
- 当前状态：`ready`

## 当前目标

- 修复第三轮真实 Desk 联调暴露的剩余问题

## 当前问题来源

- `weeklyTrend` 仍是 fallback
- `system status` 仍是兼容映射
- demo 中文 seed 存在编码异常
- 孤立设备缺少 `stationId/stationName`

## 重点任务

- 先明确哪些问题属于：
  - 数据质量问题
  - seed 数据问题
  - 契约缺口
  - Desk 侧映射问题
- 优先修不影响主架构的高价值问题

## 立即执行

- 先更新：`docs/unified/reports/desk-live-issues-fix.md`
- 再补一条 `docs/journal/2026-03.md` checkpoint
- 没有这两项落盘，不算完成

## 边界

- 不直接扩成新一轮大规模 API 重构
- 先修联调暴露的最小问题集

## 输出物

- 修复清单
- 复验结果
- `docs/unified/reports/desk-api-align.md`