---
title: cli-coordination-protocol
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/cli-coordination-protocol
---

# CLI Coordination Protocol

本文件是其他 CLI 窗口读取主线真值、领取协作信息、回报状态的稳定协议。

## 1. 单一读取入口

优先级从高到低：

1. `docs/unified/task-queue.md`
   - 看最新批量任务和当前唯一有效派发。
2. `docs/unified/reports/mainline-coordination-status-latest.json`
   - 看当前主线协调状态摘要。
3. `docs/unified/reports/desk-mainline-proof-manifest-latest.json`
   - 看主线 proof 全量入口路径。
4. `docs/unified/reports/desk-mainline-proof-history-latest.md`
   - 看最近历史快照和人工可读差异。
5. `docs/unified/reports/local-desk-mainline-runtime-latest.json`
   - 看当前本地主线 Desk 栈运行态。

## 2. 推荐命令

读取主线协调状态：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1
```

读取主线 proof 精简状态：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-desk-mainline-proof-status.ps1
```

重跑主线总 proof：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild
```

重启本地主线 API：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/restart-local-api-service.ps1 -SkipBuild
```

重启本地主线 Desk 栈：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/restart-local-desk-mainline.ps1 -SkipApiBuild
```

读取本地主线 Desk 运行态：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-local-desk-mainline-runtime.ps1
```

## 3. 回报字段

其他 CLI 窗口回报给总协调器时，至少应包含：

- `latestBatch.taskId`
- `proof.completedChecks`
- `proof.rainfall`
- `history.currentStamp`
- `diff.unchanged`
- `diff.unchangedVsLastMatching`

如果是页面或模块任务，还应补：

- 本窗口修改了什么
- 跑了哪条 proof
- 是否恢复现场
- 是否影响 demo truth

## 4. 判读规则

- `diff.unchanged=true`
  - 表示当前与上一轮快照一致。
- `diff.unchangedVsLastMatching=true`
  - 表示当前与最近稳定真值一致。
- `diff.unchanged=false` 但 `diff.unchangedVsLastMatching=true`
  - 表示上一轮有漂移，但当前已回到稳定真值。
- `diff.unchanged=false` 且 `diff.unchangedVsLastMatching=false`
  - 表示当前仍未回到最近稳定真值，需要继续排查。

## 5. 约束

- 不要自行修改 `LAMv2_Desk`
- 不要擅自改 Desk UI 结构
- 主线 Desk 默认方向仍是：
  - 后端接口打通
  - 数据链闭环
  - seed/demo 真值稳定
  - proof 留证稳定

## 6. 输出规则

- 任务完成后，最终输出原文必须同步进当月日记。
- 需要共享状态时，优先引用本协议里的命令和文件，不再自创读取口径。