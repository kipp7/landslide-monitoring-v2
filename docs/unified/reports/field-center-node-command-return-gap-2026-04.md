---
title: field-center-node-command-return-gap-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-center-node-command-return-gap-2026-04
---

# 中心节点命令回流能力缺口（2026-04）

## 状态

- topic: `field-center-node-command-return-gap`
- state: `current-gap-frozen`
- updated_at: `2026-04-12`
- authority: `current`

## 1. 这份报告当前回答什么问题

这份报告当前只回答一个主线问题：

- 在真实现场拓扑下，为什么 `cmd_ack/{device_id}` 在 RK3568 侧仍会出现 strict closure 不稳定
- 以及当前还能不能把主嫌疑继续放在 `field-gateway` “根本收不到 ACK”

## 2. 当前真实边界

当前真实主线已经固定为：

- `field nodes RK2206 A/B/C`
- `-> center node`
- `-> RK3568 /dev/ttyS3`
- `-> MQTT / platform`

因此当前 RK3568 `field-gateway` 的职责是：

- 接收中心节点汇聚后的共享串口流
- 把 `cmd/{device_id}` 写回共享串口
- 从共享流里识别 telemetry / ack 并发布到平台

它不是当前现场里“单独控制所有分节点调度”的中心节点程序本体。

## 3. 当前最新权威证据

### 3.1 运行时基线

- [field-rk3568-gateway-runtime-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-runtime-latest.json)
  - `generatedAt = 2026-04-12T14:10:45Z`
  - `serviceActive = active`
  - `serial.open = true`
  - `mqtt.connected = true`
  - `configuredNodes = 3`

### 3.2 共享口质量基线

- [field-rk3568-edge-link-quality-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-edge-link-quality-latest.json)
  - `generatedAt = 2026-04-12T13:54:20Z`
  - `accepted = true`
  - `overallLevel = attention`
  - `interleavingSuspected = 20`

### 3.3 同节点、同链路、同轮次的配对 proof

本轮新增的关键事实，不再是单条成功或单条失败，而是同一条真实主线上的“成功/失败并存”：

1. `node B manual_collect` 成功样本
- [.tmp/rk3568-node-command-proof-check.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-node-command-proof-check.json)
  - `generatedAt = 2026-04-12T14:07:56Z`
  - `passed = true`
  - `ackEvidence.status = acked`

2. `node B manual_collect` 失败样本
- [.tmp/rk3568-node-command-proof-b-manual.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-node-command-proof-b-manual.json)
  - `generatedAt = 2026-04-12T14:11:31Z`
  - `passed = false`
  - `commandEvidence != null`
  - `readPathEvidence.telemetryAdvancedToCommand = true`
  - `ackEvidence = null`
  - `diagnosis.summary = target-consumed-command-but-ack-corrupted-by-shared-stream-byte-interleaving`

3. `node B set-report-5` 成功样本
- [.tmp/rk3568-node-command-proof-b-set-report-5.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-node-command-proof-b-set-report-5.json)
  - `generatedAt = 2026-04-12T14:11:57Z`
  - `passed = true`
  - `ackEvidence.status = acked`
  - `ackMessagesPublishedDelta = 1`

## 4. 现在已经可以正式排除什么

根据这三条最新证据，当前可以正式排除以下旧口径：

1. 不能再说 `ACK` “绝对回不来”
- 因为同日已有 `manual_collect` 与 `set_config` 的显式 `acked` 成功样本

2. 不能再说 `field-gateway` “根本没有 ACK 发布能力”
- 因为成功样本里已经出现：
  - `field gateway command ack published`
  - `status = acked`

3. 不能再把当前主 blocker 写成 `node C 未接入` 或 `node C 单点故障`
- 当前真实 blocker 发生在共享 `/dev/ttyS3` 的闭环稳定性，不是三节点接入事实本身

## 5. 当前最准确的工程读取

当前最准确的工程读取是：

- 命令转发链是通的
- telemetry 主链是通的
- `device_id` 区分是成立的
- 显式 `cmd_ack/{device_id}` 已经证明“有时可以回到 RK3568”
- 但在共享串口流量与解析噪声叠加时，ACK strict closure 仍会间歇失败

换句话说，当前问题不再是：

- `ACK completely missing`

而是：

- `ACK / strict closure intermittently succeeds under shared-stream instability`

## 6. 当前最可信的失效形态

当前最新失败样本已经把失效形态收窄到：

- 命令已前转
- 目标节点消费推进已能从 telemetry `last_command_id / last_command_type` 观察到
- 但显式 ACK 未被本轮 proof 观测到
- 同窗口存在 `shared-stream-byte-interleaving`

因此当前最可信的失效形态是：

- `target-consumed-command-but-ack-corrupted-by-shared-stream-byte-interleaving`

而不是：

- `command never reached target`
- `field-gateway simply forgot to publish ack`

## 7. 当前主缺口应该如何表述

当前主缺口应冻结为：

- `shared /dev/ttyS3 command-return strict closure instability`

不应再写成：

- `node C command return impossible`
- `field-gateway no-ack gap`
- `center program missing so nothing can continue`

## 8. 处理边界

当前处理边界也要明确：

1. RK3568 侧继续做的事情
- runtime / observation / proof / rejected evidence 取证
- 失败归因分类
- northbound 契约保持稳定

2. RK3568 侧不应做的事情
- 伪造 ACK
- 用宽松补丁把不确定样本硬判成成功
- 重新改写现场硬件拓扑口径

3. 真正需要推进的修复方向
- source-side control
  - `single-writer serialization`
  - `ACK quiet-window`
  - `latest-value slot`

## 9. 下一步只应做什么

下一步应顺序化为：

1. 继续保留 RK3568 latest runtime / proof 证据
2. 用成对 proof 持续验证“间歇成功”而不是“绝对失败”
3. 以当前证据为边界，把 source-side control 需求压实
4. 在 source-side control 落地前，不再回到：
- `node C` 单点怀疑
- `field-gateway` 绝对无 ACK 的旧叙事

## 10. 一句话结论

当前中心节点命令回流的真实缺口，不是 ACK 绝对不存在，而是共享 `/dev/ttyS3` 条件下 ACK strict closure 仍呈间歇成功；RK3568 侧已完成观察与定界，真正的修复方向应回到 source-side control。
