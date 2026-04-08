---
title: field-rk3568-shared-port-two-node-baseline-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-shared-port-two-node-baseline-2026-04
---

# RK3568 共享串口两节点冻结基线（2026-04）

## 状态

- topic: `field-rk3568-shared-port-two-node-baseline`
- state: `baseline-frozen`
- updated_at: `2026-04-08`
- authority: `current`

## 1. 这份基线解决什么问题

第三块板当前还不能接入，不适合继续把主线建立在“三节点全齐”这个条件上。

所以这份文档的目标很明确：

- 在 `node C` 未到位之前
- 把当前已经被真实硬件反复复证的
  - `2 节点`
  - `1 个中心 XL01`
  - `1 条 /dev/ttyS3`
  这条线冻结成临时正式基线

这样做的作用是：

- 后续软件和部署工作不再来回漂
- 当前验收入口固定
- `node C` 到位后只是在现有基线上扩展，而不是重新找路

## 2. 当前冻结的现场真值

当前共享串口现场真值冻结为：

1. 拓扑
- `node A (RK2206)`
- `node B (RK2206)`
- `center XL01`
- `RK3568 /dev/ttyS3`

2. 节点标识
- `A`
  - `device_id = 00000000-0000-0000-0000-000000000001`
- `B`
  - `device_id = 00000000-0000-0000-0000-000000000002`
- `C`
  - `device_id = 00000000-0000-0000-0000-000000000003`
  - 当前仅保留接入位
  - `enabled = false`

3. RK3568 当前运行态
- `southbound.routeMode = configured-node-routing`
- `southbound.configuredNodes = 3`
- `southbound.configuredPorts = 1`
- `southbound.activeSerialDevice = /dev/ttyS3`
- `southbound.ports[0].mappedNodeCount = 3`
- `southbound.ports[0].enabledNodeCount = 2`

## 3. 当前已经拿到的正向证据

### 3.1 `manual_collect`

最新共享串口 fresh runtime 证据：

- `commandId = 3a989480-a41e-4bb3-98bf-1db7bd45b664`
- `diagnosis.summary = command-forward-and-ack-publish-succeeded`

### 3.2 `set_config -> 300s`

最新共享串口 fresh runtime 证据：

- `commandId = 7acb0df9-5647-4551-a283-9d4b9ca0f78e`
- `diagnosis.summary = command-forward-and-ack-publish-succeeded`

### 3.3 `set_config -> 5s`

最新共享串口 fresh runtime 证据：

- `commandId = db328b8c-0874-4f35-81a1-ef576b8178f2`
- `diagnosis.summary = command-forward-and-ack-publish-succeeded`

### 3.4 当前计数面

当前 latest health 事实已确认：

- `commandsReceived = 7`
- `commandsForwarded = 7`
- `ackMessagesPublished = 4`
- `southbound.ports[0].ackMessages = 4`
- `nodes[B].commandForwards = 7`
- `nodes[B].ackPublishes = 4`

因此，到这一步为止，当前共享串口两节点基线已经不再只是：

- 只能看 telemetry

而是已经具备：

- telemetry 上行
- `manual_collect`
- `set_config`

这三个最小能力的实机闭环。

## 4. 但当前冻结基线并不等于“已经稳定”

在把 proof 判定收紧为：

- 必须拿到同一 `command_id` 的
  - `status = acked`

之后，最新一轮一键基线复跑结果为：

- 脚本入口：
  - `run-rk3568-shared-port-two-node-baseline.ps1`
- 最新结论：
  - `baseline-failed-but-report-interval-restored-to-5s`
- latest counters:
  - `commandsReceived = 17`
  - `commandsForwarded = 17`
  - `ackMessagesPublished = 11`
  - `nodeCommandForwards = 17`
  - `nodeAckPublishes = 11`

其中最新严格结果显示：

1. `manual_collect`
- `commandId = 81c6a043-77ff-4ec3-9b6a-8229a3924cdd`
- `passed = false`
- `summary = ack-published-but-proof-did-not-classify-as-passed`
- 现象是：
  - 命令已转发
  - 统计面没有拿到新的 `status=acked` 证据

2. `set-report-300`
- 在本轮 fail-fast 入口中没有继续执行
- 因为脚本在 `manual_collect` 已经判失败后直接进入恢复步骤

3. `set-report-5`
- 恢复步骤成功
- `commandId = 879673c0-ffcd-4ec2-b01b-ffa29aff4cfa`
- `passed = true`
- `ackStatus = acked`

所以当前真正可信的工程结论不是：

- “两节点共享串口已经稳定”

而是：

- 两节点共享串口具备可运行证据
- 但在更严格的 ACK 成功判定下仍然存在间歇性不稳定
- 现场节奏至少已被成功恢复到：
  - `report_interval_s = 5`

## 5. 当前仍然存在的问题

共享 `/dev/ttyS3` 串流里仍然存在：

- `southbound-json-fragmentation`
- `shared-stream-byte-interleaving`
- `unclassified-parse-failure`

当前它们仍体现在：

- `schemaRejected`
- `field gateway json parse failed`

但当前工程结论已经变化：

- 这些问题仍然真实存在
- 但已经不是当前两节点共享串口最小命令闭环的 blocker
- 它们现在属于：
  - 稳健性缺口
  - 长时间窗质量问题

## 6. 当前固定验收入口

为了避免继续手工拼 proof，当前两节点共享串口冻结基线的统一入口固定为：

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-rk3568-shared-port-two-node-baseline.ps1 -Password linaro`

它当前固定顺序为：

1. `manual_collect`
2. `set-report-300`
3. `set-report-5`

设计原则：

- 一次运行同时覆盖：
  - 命令触发
  - ACK 回灌
  - 配置变更
  - 现场节奏恢复
- 最后一步始终回到：
  - `report_interval_s = 5`

## 7. 第三块板未到之前，主线应该做什么

在 `node C` 未到之前，主线不应该再停留在：

- 重复证明两节点能不能通
- 围绕 ACK 回不回来反复试

而应该转成三类工作：

1. 冻结当前两节点共享串口临时基线
- 当前文档就是这一层 authority

2. 用固定入口做稳定性回归
- 复用：
  - `run-rk3568-shared-port-two-node-baseline.ps1`

3. 在两节点上继续收紧确定性
- 重点不再只是“有没有 ACK 消息”
- 而是：
  - 能不能稳定拿到同一 `command_id` 的 `status=acked`

4. 继续做软件和部署准备
- RK3568 运行包装
- 联网/恢复策略
- 中心部署依赖
- node `C` 接入位保留

## 8. `node C` 到位后的唯一扩展方式

`node C` 到位后，不应重新设计路线。

唯一正确扩展方式是：

1. 让 `device_id = ...0003` 进入同一中心 XL01 串流
2. 将 `enabled = false` 改为：
  - `enabled = true`
3. 在同一条基线上复跑：
  - `manual_collect`
  - `set_config`
4. 再进入更长时间窗稳健性压测

## 9. 当前结论

在第三块板暂未到位的窗口内，当前正式冻结基线应视为：

- `2 个 RK2206`
- `1 个中心 XL01`
- `1 条 /dev/ttyS3`
- `telemetry 已持续`
- `manual_collect / set_config 已拿到成功样本`
- 但共享串口命令闭环仍未达到稳定可交付

这条线已经足够支撑：

- 软件继续写
- RK3568 继续固化
- 中心部署继续收口

而不会因为第三块板延迟就让主线停住。
