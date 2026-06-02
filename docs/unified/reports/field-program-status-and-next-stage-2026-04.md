---
title: field-program-status-and-next-stage-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-program-status-and-next-stage-2026-04
---

# 现场主线当前阶段与下一阶段任务（2026-04）

## 状态

- topic: `field-program-status-and-next-stage`
- state: `phase-rebased-after-b-center-fix`
- updated_at: `2026-04-13`
- authority: `current`

## 1. 当前真实主线

当前现场真实主线固定为：

- `field nodes RK2206 A/B/C`
- `-> center XL01`
- `-> RK3568 /dev/ttyS3`
- `-> MQTT / API / Web`

当前不应再回流以下旧叙事：

- `node C` 未接入
- `shared_port_scheduler` 仍是当前主线
- 当前主阻塞仍是“RK3568 通用 ACK 不稳定”

## 2. 已冻结的阶段事实

### 2.1 北向软件链已打通

已完成：

- `telemetry/{device_id}` 上行
- `cmd/{device_id}` 下行
- `cmd_ack/{device_id}` 回灌
- `device_state` 写入
- API / Web 读取当前状态

证据：

- [field-rk3568-center-live-closure-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-center-live-closure-latest.json)

### 2.2 `node B` ACK 主问题已定位并修复

当前权威结论已经收敛为：

- 根因在 RK3568 `field-gateway` 的 southbound command prewrite 串口状态处理
- 修复点已落在 [index.ts](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/services/field-gateway/src/index.ts)
- 修复后的关键运行态包括：
  - `lastPrewriteFlushTs`
  - `prewriteFlushFailures`
  - `lastPrewriteQuietSatisfiedTs`
  - `prewriteQuietTimeouts`

配对证据：

- 修复前：
  - [rk3568-b-live-proof-179-series-summary-20260413.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-b-live-proof-179-series-summary-20260413.json)
  - [rk3568-b-live-proof-179-postraw-1-20260413.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-b-live-proof-179-postraw-1-20260413.json)
  - [rk3568-b-live-proof-179-postraw-2-20260413.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-b-live-proof-179-postraw-2-20260413.json)
- 修复后：
  - [rk3568-b-live-proof-179-afterflush-summary-20260413.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-b-live-proof-179-afterflush-summary-20260413.json)
  - [rk3568-b-live-proof-179-afterflush-soak-summary-20260413.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-b-live-proof-179-afterflush-soak-summary-20260413.json)
  - [rk3568-b-live-proof-179-recheck-20260413.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-b-live-proof-179-recheck-20260413.json)

冻结结论：

- 修复前 `manual_collect` 存在 `4/5`、`1/2` 的间歇失败
- 修复后 `manual_collect` 已拿到 `5/5`、`10/10`、`1/1`
- 因此 `node B` 当前不应再被描述为“根因未明”

### 2.3 当前运行态已经换了主 blocker

最新运行态显示：

- 串口在线
- MQTT 在线
- parser rejection = `0`
- interleaving counters = `0`
- `nodeB = online`
- `nodeA = configured`
- `nodeC = configured`

证据：

- [field-rk3568-gateway-runtime-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-runtime-latest.json)
- [field-rk3568-edge-link-quality-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-edge-link-quality-latest.json)
- [rk3568-observation-179-20260413.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-observation-179-20260413.json)

## 3. 当前唯一主 blocker

当前唯一主 blocker 已经不是：

- `node B` ACK 根因不明
- 通用 parser 污染
- 通用 shared-port 软件失稳

当前唯一主 blocker 是：

- `192.168.124.179` 当前 runtime 里，`node A / node C` 还没有进入中心侧观测窗口

具体表现为：

- `nodeA.telemetryMessages = 0`
- `nodeA.commandForwards = 0`
- `nodeA.ackPublishes = 0`
- `nodeC.telemetryMessages = 0`
- `nodeC.commandForwards = 0`
- `nodeC.ackPublishes = 0`

这意味着：

- 现在不能把问题继续笼统归到 RK3568 主线代码
- 也不能直接把下一步写成“大改协议/大改架构”
- 当前更准确的描述是：`center-side fixed for B, field-side visibility of A/C not yet restored`

## 4. 我们现在所处阶段

当前阶段不再是：

- `shared-port quality closure phase`

当前阶段应更新为：

- `three-node runtime recovery and regression phase`

阶段含义：

- 中心侧 send path 第一轮 hardening 已经落地
- `node B` 的 ACK 主问题已经在当前主线修住
- 下一步不是继续围绕 B 做孤立修补
- 下一步是把 `A/C` 拉回 runtime，再跑真实三节点回归

## 5. 下一阶段任务

### 5.1 第一包：冻结当前中心版本

目标：

- 保持当前 RK3568 `field-gateway` 修复版本不回退
- 不重新打开 `shared_port_scheduler`
- 不回到“中心侧 RK2206 烧录”主线

### 5.2 第二包：恢复 `A/C` 中心侧可见性

目标：

- 让 `node A / node C` 出现在 `field-rk3568-gateway-runtime-latest.json`
- 让 `node A / node C` 至少进入 `online|degraded`
- 让观测窗口里不再只有 B 计数增长

### 5.3 第三包：真实三节点回归

目标：

- 在 `A/B/C` 同时可见的前提下，复跑：
  - `manual_collect`
  - `set_config`
- 重新验证：
  - 命令转发
  - ACK 返回
  - telemetry 连续性
  - parser / interleaving counters

### 5.4 第四包：仅在复发时重开共享流争用诊断

仅当三节点同在线后再次出现失败，才重开以下诊断线：

- upstream shared contention
- source-side arbitration
- protocol-level hardening

在此之前，不应把这些重新写成当前主 blocker。

## 6. 当前一句话结论

当前项目不是卡在“RK3568 ACK 普遍不稳定”；当前更准确的结论是：`node B` 的 ACK 根因已经在 RK3568 中心侧发送路径定位并修复，现阶段真正阻塞是 `node A / node C` 还没有进入 `192.168.124.179` 的中心侧 runtime，因此下一阶段应直接转入三节点运行态恢复与回归验证。
