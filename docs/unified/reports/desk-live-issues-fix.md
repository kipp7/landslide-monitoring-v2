---
title: desk-live-issues-fix
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/desk-live-issues-fix
---

# desk-live-issues-fix

## Status

- task: `desk-live-issues-fix`
- state: `completed`
- updated_at: `2026-03-14`

## Current Scope

本任务只处理第三轮真实联调暴露的问题归因与最小修补，不继续在 Desk 端扩大临时 fallback。

## Resolved Upstream Issues

以下两项已不再是当前 blocker：

1. 中文 seed 编码异常
2. 孤立设备缺少 `stationId/stationName`

当前证据：

- `/api/v1/stations` 已返回：
  - `stationName = 示例监测点A`
  - `metadata.locationName = 示例监测区A`
- `/api/v1/devices` 当前仅保留 3 个正式 demo 设备

## Original Blockers

### 1. `weeklyTrend`

- 归因：`后端契约缺口`
- 原因：
  - 原先没有真实 `/api/v1/dashboard/weekly-trend`
  - Desk 只能临时 fallback

### 2. `system status`

- 归因：`后端契约缺口`
- 原因：
  - 原先 `/api/v1/system/status` 只返回健康摘要
  - Desk 当前 `cpu/mem/disk` 只是兼容映射，不是等价模型

## Backend Contract Checkpoint（2026-03-14）

### 本轮实现

- 主线 `services/api` 已补：
  - `GET /api/v1/dashboard/weekly-trend`
  - `GET /api/dashboard/summary`
  - `GET /api/dashboard/weekly-trend`
  - `GET /api/system/status`
- 主线 `GET /api/v1/system/status` 已扩展为健康摘要正式口径，新增：
  - `source`
  - `note`
  - `items[]`
- 主线契约文档已同步：
  - `docs/integrations/api/07-system.md`
  - `docs/integrations/api/018-desk-ui.md`
  - `docs/integrations/api/openapi.yaml`
  - `docs/integrations/api/openapi.sha256`

### 当前验证

- `npm -w services/api run build` 已通过
- `python docs/tools/run-quality-gates.py` 已通过
- 通过 `scripts/dev/check-system-routes.ps1` 在临时 `18080` 实例验证：
  - `GET /api/v1/dashboard/weekly-trend` 返回 `200`
  - `GET /api/v1/system/status` 返回 `200`
  - `GET /api/dashboard/summary` 返回 `200`
  - `GET /api/dashboard/weekly-trend` 返回 `200`
  - `GET /api/system/status` 返回 `200`

### 当前留证说明

- 本轮真实返回已证明：
  - v1 正式接口存在
  - legacy Desk 兼容接口存在
  - `system status` 新字段 `source/note/items[]` 已实际返回
  - `weeklyTrend` 已实际返回 `labels/rainfallMm/alertCount/source/note`
- 当前临时验证实例存在环境差异：
  - ClickHouse 凭据未与现有运行态完全对齐
  - 因此 `weeklyTrend.rainfallMm` 当前为 0，并在 `note` 中带出回退说明
  - 这属于**环境配置差异**，不是路由缺失或响应形状缺失

### 当前判断

- `weeklyTrend` 的后端契约缺口已形成主线实现与真实返回留证
- `system status` 的正式健康摘要口径已形成主线实现与真实返回留证
- 当前仍保留的环境差异不再阻塞本任务按当前范围收口

## Desk-side Minimal Fixes Already Done

- 对明显乱码的 `stationName` 回退到 `stationCode`
- 对空站点名回退到 `Unassigned`
- 这些修补已完成，不再继续扩大

## Current Judgment

- 本任务当前应视为：`completed`
- 已有主线实现、编译验证、最小真实返回留证、Desk 消费侧构建通过
- 若继续推进，应另起新任务处理运行环境一致性或更高强度验证

## Next Step

- 当前任务已收口
- 若继续主线推进，建议转入下一条主任务

## Completion Sync（2026-03-14）

### 本轮补充验证

- `scripts/dev/check-system-routes.ps1 -KeepLogs` 已通过，完成以下接口真实返回留证：
  - `GET /api/v1/dashboard/weekly-trend`
  - `GET /api/v1/system/status`
  - `GET /api/dashboard/summary`
  - `GET /api/dashboard/weekly-trend`
  - `GET /api/system/status`
- `desk-api-align` worktree 中 `npm -w apps/desk run build` 已通过

### 当前结论

- 按本任务“补齐 W2 契约缺口并完成最小可运行验证”的范围判断，当前轮目标已经完成
- 已具备：
  - 后端接口实现
  - legacy 兼容路径真实返回
  - Desk 消费侧构建通过
- 当前残留的 ClickHouse 凭据差异属于运行环境配置问题，不再阻塞本任务按当前范围收口