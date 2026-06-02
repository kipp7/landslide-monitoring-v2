---
title: platform-runtime-stabilization
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/agent-briefs/platform-runtime-stabilization
---

# 任务简报：platform-runtime-stabilization

## 当前状态

- 第四轮任务
- 当前状态：`ready`

## 当前目标

- 让当前平台环境从“曾成功启动”变成“可稳定复验、可重复启动”

## 重点任务

- 整理 `infra/compose/.env` 的最小稳定模板
- 明确 Docker / Compose / 初始化脚本的标准启动顺序
- 尽量让 `api-service` 也能稳定启动并保持可访问
- 输出一份当前机器可复验的运行步骤

## 立即执行

- 先更新：`docs/unified/reports/platform-runtime-stabilization.md`
- 再补一条 `docs/journal/2026-03.md` checkpoint
- 没有这两项落盘，不算完成

## 边界

- 不扩展到 Desk 页面修复
- 不扩展到算法实现
- 只处理平台环境稳定性与复验问题

## 输出物

- 常驻启动方案
- 复验步骤
- `docs/unified/reports/platform-restore-check.md`