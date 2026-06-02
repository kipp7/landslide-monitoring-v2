---
title: desk-api-align
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/agent-briefs/desk-api-align
---

# 任务简报：desk-api-align

## 当前状态

- 第二轮任务
- 当前状态：`ready`

## 当前目标

- 进入 `desk-api-implementation`
- 基于第一轮对齐结论，设计并落地 Desk 侧 response adapter
- 选择首批最关键接口做实现切口

## 重点任务

- 先设计 Desk 统一 response adapter
- 先选首批迁移接口：
  - 登录
  - dashboard
  - stations
  - devices
- 明确字段映射和错误处理

## 边界

- 不要直接大面积重构 Desk 页面
- 不要直接大改 `services/api`
- 不要把多个页面各自写一套字段转换逻辑
- 优先集中在 adapter 层解决

## 输出物

- adapter 方案
- 首批迁移实现
- 回归结论
- `docs/unified/reports/desk-api-align.md`