---
title: gnss-protocol
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/agent-briefs/gnss-protocol
---

# 任务简报：gnss-protocol

## 当前状态

- 第四轮任务
- 当前状态：`ready`

## 当前目标

- 进入 `gnss-demo-data-fix`
- 基于第三轮 Desk 真实联调暴露的问题，修复 GNSS / 站点 demo 数据质量问题

## 重点任务

- 重点检查并修复：
  - demo 中文 seed 编码异常
  - 设备存在数据但缺少 `stationId/stationName`
  - GNSS 相关 demo 数据与站点映射关系
- 明确哪些属于：
  - seed 数据问题
  - 导入脚本问题
  - 展示层兼容问题

## 本轮最小交付

- 产出一份 demo 数据问题清单
- 若能直接修复，则给出修复后的文件
- 若暂时不能直接修复，则明确最小修复入口和依赖
- 报告中必须写明检查过的具体文件路径

## 立即执行

- 先更新：`docs/unified/reports/gnss-demo-data-fix.md`
- 再补一条 `docs/journal/2026-03.md` checkpoint
- 没有这两项落盘，不算完成

## 边界

- 不扩展成 Desk 页面改造
- 不扩展成算法实现
- 只处理 GNSS / 站点 / seed / 映射质量问题

## 输出物

- demo 数据问题清单
- seed 修复结论
- `docs/unified/reports/gnss-protocol.md`