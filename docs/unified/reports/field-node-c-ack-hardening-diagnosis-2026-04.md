---
title: field-node-c-ack-hardening-diagnosis-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-node-c-ack-hardening-diagnosis-2026-04
---

# node C ACK 弱点诊断（2026-04）

## 状态

- topic: `field-node-c-ack-hardening-diagnosis`
- status: `active`
- updated_at: `2026-04-12`
- authority: `current`

## 1. 本轮范围

本轮只收口一个问题：

- `node C` 在三节点共享 `/dev/ttyS3` 主线下
- `manual_collect`
- `set_config`

为什么仍然无法形成可重复的 `cmd_ack/{device_id}` 闭环。

## 2. 本轮先修正的伪结论

`scripts/dev/run-rk3568-field-gateway-node-command-proof.ps1` 原来会把历史累计 `ackMessagesPublished > 0` 误判成：

- `ack-published-but-proof-did-not-classify-as-passed`

这会掩盖当前命令窗口里其实没有新增 ACK 的事实。

本轮已修正为：

- 使用本次窗口增量而不是进程累计值
- 同时输出：
  - `commandsForwardedDelta`
  - `ackMessagesPublishedDelta`
  - `nodeAckPublishesDelta`
  - `nodeTelemetryDelta`
  - `nodeStatusBefore`
  - `nodeStatusAfter`

因此，后续 proof 的失败摘要现在可以直接用于现场归因。

## 3. 当前实机证据

### 3.1 `manual_collect`

- command id:
  - `e1364e60-dc4e-40a1-b3b9-8c2a2e34686f`
- latest result:
  - `passed = false`
  - `commandEvidence != null`
  - `ackEvidence = null`
  - `commandsForwardedDelta = 1`
  - `ackMessagesPublishedDelta = 0`
  - `nodeAckPublishesDelta = 0`
  - `nodeTelemetryDelta = 3`
  - `nodeStatusBefore = online`
  - `nodeStatusAfter = online`
  - `diagnosis.summary = ack-blocked-by-southbound-json-fragmentation`

### 3.2 `set_config`

- command id:
  - `d95223cd-a1db-4504-8114-1006d32a7f0b`
- latest result:
  - `passed = false`
  - `commandEvidence != null`
  - `ackEvidence = null`
  - `commandsForwardedDelta = 1`
  - `ackMessagesPublishedDelta = 0`
  - `nodeAckPublishesDelta = 0`
  - `nodeTelemetryDelta = 0`
  - `nodeStatusBefore = online`
  - `nodeStatusAfter = offline`
  - `diagnosis.summary = command-forwarded-while-node-offline`

## 4. 当前可以排除什么

当前已经不再把以下方向当成主怀疑：

1. `device_id` 配错
- 当前外部固件工作区 `config/app_config.h` 明确是：
  - `DEVICE_ID = 00000000-0000-0000-0000-000000000003`
  - `INSTALL_LABEL = FIELD-NODE-C`
  - `LEGACY_NODE_LABEL = C`

2. proof 脚本单纯误报
- 本轮脚本归因已经修正
- 失败结论现在对应的是本次窗口增量

3. `node C` 完全不在线
- `manual_collect` 这次 proof 期间：
  - `nodeTelemetryDelta = 3`
  - `nodeStatusBefore/After = online`
- 说明命令下发时 `node C` 仍有回流 telemetry

## 5. 当前最可信的解释

当前最可信的解释是：

- `node C` 命令已到达中心共享流并被 RK3568 转发
- `node C` 自身 telemetry 仍在继续回流
- 但 ACK 没有以一条可恢复、可发布的完整 JSON 被 RK3568 看到

因此当前弱点更接近：

1. ACK 在共享上行里被其他节点 telemetry 污染
2. ACK 在源端已碎片化，进入 RK3568 时已不是可恢复边界
3. 部分窗口内 `node C` 自身又短暂跌成 `offline`，进一步降低 ACK 闭环成功率

换句话说，当前不是“命令没下去”，而是：

- `ACK / command-result return path` 仍不稳定

## 6. 当前工程结论

当前阶段不能把三节点共享主线写成“命令闭环已完全稳定”，因为：

- `node A/B` 已有 ACK 发布事实
- 但 `node C ackPublishes` 仍然是 `0`
- 且两类命令都还不能稳定闭环

因此下一包仍然应保持为：

- `node C southbound ack closure hardening`

而不是重新回头讨论：

- 架构真假
- `device_id` 是否接入
- API / Web 是否可见

## 7. 新增原始串口切分证据

为避免继续把 `field-gateway` 的解析/发布行为误当成唯一嫌疑，本轮新增并修正了：

- `scripts/dev/run-rk3568-raw-serial-command-capture.ps1`

该脚本会：

- 通过 SSH 登入 RK3568
- 临时停止 `lsmv2-field-gateway.service`
- 直接抓取 `/dev/ttyS3`
- 在原始串口窗口里写入一条针对 `node C` 的 runtime command
- 20 秒后恢复服务并输出原始回流

### 7.1 `manual_collect` 原始串口结果

- command id:
  - `a9edafd7-6895-479a-a36b-ed2a33fed4eb`
- raw result:
  - `serviceWasActive = true`
  - `serviceStopMethod = sudo-systemctl`
  - `capturedBytes = 6550`
  - `lineCount = 10`
  - `ackLikeLineCount = 0`
- raw stream facts:
  - 只看到了 `node A / B / C` 的周期 telemetry
  - `node C` 回流 telemetry 里的：
    - `last_command_type = ""`
    - `last_command_id = ""`
    - `last_command_uptime_s = 0`
  - 没有出现任何：
    - `command_id`
    - `ack_ts`
    - `status`

### 7.2 `set_config` 原始串口结果

- command id:
  - `55438c43-acb1-4057-8c6f-b55303e942b2`
- raw result:
  - `serviceWasActive = true`
  - `serviceStopMethod = sudo-systemctl`
  - `capturedBytes = 6555`
  - `lineCount = 10`
  - `ackLikeLineCount = 0`
- raw stream facts:
  - 同样只看到了 `node A / B / C` 的周期 telemetry
  - `node C` telemetry 仍然保持：
    - `last_command_type = ""`
    - `last_command_id = ""`
    - `last_command_uptime_s = 0`
  - 没有出现任何 `set_config` 对应 ACK / result JSON

## 8. 原始串口证据后的收窄结论

这轮原始串口切分之后，可以再排除一层：

1. 不是单纯 `field-gateway` 漏发布 ACK
- 因为停掉 `field-gateway` 以后，`/dev/ttyS3` 原始窗口里本身就没有 `node C` ACK

2. 不是本次 proof 只差一点点 ACK 识别规则
- 因为原始串口里连 `ack_ts/status/command_id` 这类 ACK 基本标记都不存在

因此当前更可信的主阻塞已经收敛为：

- `node C` 的命令在 RK3568 之后并没有形成可见的 southbound ACK 回流
- 这弱点位于 `field-gateway` 以上游的中心节点共享流路径
- RK3568 当前更多是在忠实暴露这个问题，而不是制造这个问题

## 9. 下一步

1. 保留 `run-rk3568-raw-serial-command-capture.ps1` 作为后续回归切分入口
2. 继续把 `node C` ACK 缺失与中心节点共享流时窗绑定到同一证据包
3. 只讨论真正可控的收口点：
- 上游共享流串扰控制
- ACK 返回窗保护
- `node C` 在线连续性
- 中心节点侧 command/result 回流能力

## 10. 本轮新增二次证据（RK3568 proof 已接入读路径判定）

本轮对 `scripts/dev/run-rk3568-field-gateway-node-command-proof.ps1` 加入了：

- 平台读路径 `device state`
- `meta.last_command_id`
- `meta.last_command_type`
- `meta.upload_trigger`

因此可以把“ACK 不见了”进一步拆成：

1. 目标已消费命令，但 ACK 在共享流里损坏
2. 命令虽已转发，但目标节点侧没有观察到消费推进

### 10.1 最新 `manual_collect` 重跑

- command id:
  - `f32bb9f4-01bd-4c65-b418-2f19346d4976`
- latest result:
  - `passed = false`
  - `commandEvidence != null`
  - `ackEvidence = null`
  - `commandsForwardedDelta = 1`
  - `ackMessagesPublishedDelta = 0`
  - `nodeAckPublishesDelta = 0`
  - `nodeTelemetryDelta = 7`
  - `nodeStatusBefore = online`
  - `nodeStatusAfter = online`
  - `readPathEvidence.available = true`
  - `readPathEvidence.lastCommandId = ""`
  - `readPathEvidence.lastCommandType = ""`
  - `readPathEvidence.uploadTrigger = "periodic"`
  - `targetTelemetryAdvancedToCommand = false`
  - `diagnosis.summary = forwarded-but-not-observed-at-target-with-shared-stream-byte-interleaving`

### 10.2 新增结论

这条最新证据比旧版只看 ACK 的 proof 更窄：

- 当前不是“`node C` 已消费命令，只是 ACK 被 RK3568 漏掉”
- 因为平台读路径里的：
  - `last_command_id`
  - `last_command_type`
  - `upload_trigger`
  都没有推进
- 同时又存在共享流 interleaving / fragmentation 噪声

所以对 `node C manual_collect` 当前更准确的读法是：

- 命令已进入 RK3568 并写入共享串口
- 目标节点侧仍没有形成可观察消费推进
- 共享流乱度仍然是当前最强伴随事实

### 10.3 最新 `set_config` 重跑

- command id:
  - `bc98243e-4f5c-4428-aab6-e532f8a9dbd0`
- latest result:
  - `passed = false`
  - `commandEvidence != null`
  - `ackEvidence = null`
  - `commandsForwardedDelta = 1`
  - `ackMessagesPublishedDelta = 0`
  - `nodeAckPublishesDelta = 0`
  - `nodeTelemetryDelta = 0`
  - `nodeStatusBefore = degraded`
  - `nodeStatusAfter = degraded`
  - `readPathEvidence.available = true`
  - `readPathEvidence.updatedAt = 2026-04-12T10:43:47Z`
  - `readPathEvidence.lastCommandId = 094d1e33-4c44-47d4-8255-35fc716c569d`
  - `readPathEvidence.lastCommandType = set_config`
  - `readPathEvidence.uploadTrigger = periodic`
  - `targetTelemetryAdvancedToCommand = false`
  - `diagnosis.summary = forwarded-but-not-observed-at-target-with-shared-stream-byte-interleaving`

### 10.4 二次证据后的合并结论

现在两类命令都已经在同一判定口径下收敛：

1. `manual_collect`
- 已转发
- 无 ACK 发布
- 无目标消费推进

2. `set_config`
- 已转发
- 无 ACK 发布
- 无目标消费推进
- 且本次窗口里 `node C` 没有新增 telemetry，状态保持 `degraded`

因此当前 `node C` 的问题可以再往前收窄一层：

- 不只是“ACK 没有被 RK3568 成功识别”
- 而是 `manual_collect / set_config` 两类命令都还没有在目标侧形成可观察消费推进
- 共享流 interleaving 仍是最强伴随事实
- `set_config` 还叠加了 `node C` 在线连续性较弱这一层风险
