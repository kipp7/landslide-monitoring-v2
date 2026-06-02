---
title: field-shared-port-refresh-package-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-shared-port-refresh-package-2026-04
---

# 共享口刷新包结果（2026-04）

## 状态

- topic: `field-shared-port-refresh-package`
- state: `refresh-package-completed`
- updated_at: `2026-04-12`
- authority: `current`

## 1. 本轮刷新了什么

本轮已刷新：

- RK3568 runtime snapshot
- RK3568 observation window
- RK3568 edge-link-quality
- `node C manual_collect` strict proof
- `node C set_config` strict proof
- RK3568 production uplink freeze
- RK3568 center live closure aggregation

## 2. 本轮确认的稳定事实

### 2.1 全局运行链仍然在线

当前最新 runtime：

- [field-rk3568-gateway-runtime-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-runtime-latest.json)
  - `generatedAt = 2026-04-12T08:11:10Z`
  - `service = active`
  - `mqtt.connected = true`
  - `serial.open = true`
  - `nodeA = online`
  - `nodeB = online`
  - `nodeC = online`

### 2.2 观测窗口本轮是干净的

当前最新 observation：

- [field-rk3568-gateway-observation-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-observation-latest.json)
  - `generatedAt = 2026-04-12T08:13:41Z`
  - `passed = true`
  - `conclusion = rk3568-runtime-observation-window-clean`
  - 60 秒窗口内：
    - `schemaRejected += 0`
    - `rejectedMessages += 0`
    - `publishFailures += 0`
    - `nodeA = online`
    - `nodeB = online`
    - `nodeC = online`

### 2.3 全局 freeze 与聚合 live closure 当前是绿的

- [field-rk3568-production-uplink-freeze-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-production-uplink-freeze-latest.json)
  - `generatedAt = 2026-04-12T08:16:03Z`
  - `accepted = true`
  - `currentBoundary = rk3568-production-uplink-freeze-ready`
- [field-rk3568-center-live-closure-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-center-live-closure-latest.json)
  - `generatedAt = 2026-04-12T08:14:02Z`
  - `accepted = true`
  - `strictAcceptance.accepted = true`
  - `currentBoundary = rk3568-live-center-closure-ready`

## 3. 本轮暴露出的真实弱点

### 3.1 `node C` 单节点命令闭环仍未收口

当前最新 `node C` proof：

- `manual_collect`
  - 结果文件由 [run-rk3568-field-gateway-node-command-proof.ps1](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/scripts/dev/run-rk3568-field-gateway-node-command-proof.ps1) 刷新
  - `generatedAt = 2026-04-12T08:12:38Z`
  - `passed = false`
  - `command forwarded = true`
  - `ackEvidence = null`
  - `nodeC ackPublishes = 0 -> 0`
- `set_config`
  - `generatedAt = 2026-04-12T08:15:04Z`
  - `passed = false`
  - `command forwarded = true`
  - `ackEvidence = null`
  - `nodeC ackPublishes = 0 -> 0`

这说明：

- 当前 `node C` 不是掉线
- 当前 `node C` telemetry 不是中断
- 当前问题是：
  - `node C` 命令已写入共享口
  - 但 `node C` 对应 ACK 仍未形成可被 RK3568 侧证明的闭环

### 3.2 当前 edge-link-quality 仍明确保留共享口风险

- [field-rk3568-edge-link-quality-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-edge-link-quality-latest.json)
  - `generatedAt = 2026-04-12T08:14:02Z`
  - `accepted = true`
  - `overallLevel = attention`
  - `interleavingSuspected = 3126`
  - `interleavingWithMultipleSchemas = 3126`
  - `interleavingWithMultipleDeviceIds = 3125`
  - `node_c.ackPublishes = 0`

## 4. 当前工程解释

本轮刷新包确认了一个关键分层事实：

- 全局链路可以是绿的
- 共享口 observation window 也可以在某个时间窗内是干净的
- 但这并不自动等于每个节点的 command/ack strict closure 都已收口

当前最需要警惕的误判是：

- 看到 `production uplink freeze accepted = true`
- 或看到 `center live closure accepted = true`
- 就把共享口问题判定为已经全部解决

更准确的判断应为：

- 共享口现在已经具备可运行主链
- 但 `node C` command closure 仍是当前剩余最弱点

## 5. 下一包应该直接做什么

第二包不应再泛化为“继续看看共享口质量”，而应直接收成：

- `node C southbound ack closure hardening`

优先目标：

1. 查清 `node C` ACK 为什么长期不增长
2. 确认是否是 source-side quiet window 不足
3. 确认是否是 ACK 被 telemetry 抢占或污染
4. 在真实控制点落 `single-writer serialization + ACK quiet-window + latest-value slot`
5. 落地后优先重跑 `node C manual_collect` 与 `node C set_config`

## 6. 一句话结论

第一包已经完成，并确认了：当前系统不是“全局不通”，而是“全局可运行、全局聚合可验收，但 `node C` 单节点 command/ack strict closure 仍未收口”，所以下一包必须直接对准 `node C` 在共享口上的 ACK 闭环弱点。
