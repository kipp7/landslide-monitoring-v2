---
title: field-rk3568-field-gateway-send-path-breakdown-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-field-gateway-send-path-breakdown-2026-04
---

# RK3568 `field-gateway` 发送路径拆解（2026-04）

## 状态

- topic: `field-rk3568-field-gateway-send-path-breakdown`
- state: `send-path-reviewed-and-prewrite-fix-landed`
- updated_at: `2026-04-13`
- authority: `current`

## 1. 当前冻结拓扑

这份拆解只针对当前真实部署拓扑：

- `RK2206 field node A/B/C`
- `-> center XL01`
- `-> RK3568 /dev/ttyS3`
- `-> MQTT / API / Web`

当前讨论的是：

- RK3568 如何把命令送进中心 XL01 路径
- RK3568 如何在命令后等待 ACK

当前不讨论：

- RK3568 直连 3 个分节点串口
- 中心侧 RK2206 重新烧录

## 2. 当前发送链的真实代码路径

### 2.1 MQTT 命令入口

当前命令从这里进入：

- `mqttClient.subscribe(${mqttTopicCommandPrefix}+, { qos: 1 })`
- `mqttClient.on("message", ...)`
- `handleMqttMessage(topic, payload)`

当前实现含义：

- 只要 broker 收到 `cmd/{device_id}`，就会直接进入 `handleMqttMessage(...)`
- 这里仍然没有单独拆出去的全局 command scheduler 服务
- 但真正的 per-port 发送态已经下沉到 `field-gateway` 运行时里

### 2.2 命令校验与路由

`handleMqttMessage(...)` 当前负责：

1. 解析 topic 上的 `device_id`
2. 增加 `commandsReceived`
3. JSON parse
4. `device-command.v1` schema 校验
5. `topic device` 与 `payload device` 一致性校验
6. `resolveNodeForCommand(...)` 做节点配置和端口解析

当前实现含义：

- 发送路径在进入串口前已经完成 northbound 合同校验
- 真正 southbound 的控制点从 `resolveNodeForCommand(...)` 之后开始

### 2.3 真正的 southbound 写入口

当前真正写串口的代码只有：

- `writeCommandToSerial(payload, portPath)`

但它现在已经不是早期那种“直接 `write + drain`”。

该函数当前实际已经包含：

1. 命令目标端口解析
2. prewrite quiet 检查
3. prewrite `flush`
4. 打开本次命令的 quiet-window / pending-command 运行时状态
5. `serialPort.write(...)`
6. `serialPort.drain(...)`

当前实现含义：

- southbound command path 现在已经带了 per-port 发送态
- 当前运行态里已经有：
  - `sendOwnerState`
  - `pendingCommandId`
  - `pendingCommandType`
  - `pendingCommandDeviceId`
  - `quietWindowUntilTs`
  - `lastPrewriteQuietSatisfiedTs`
  - `prewriteQuietTimeouts`
  - `lastPrewriteFlushTs`
  - `prewriteFlushFailures`

### 2.4 ACK 返回路径

ACK 不是从发送链内部直接闭合，而是经由串口读回：

- `openSerialPort(...)`
- `assembler.push(chunk)`
- `handlePayload(...)`
- `handlePayloadCandidate(...)`
- `publishCommandAck(...)`

当前实现含义：

- ACK 仍然是“串口读回再 northbound publish”
- 但 `publishCommandAck(...)` 已经承担 quiet-window 关闭职责
- 最新 runtime 里已经能看到：
  - `lastQuietWindowCloseReason = acked`
  - `quietWindowTimeouts = 0`
  - `lastAckTs` 与 `lastCommandTs` 同步推进

### 2.5 Telemetry 路径与发送链的关系

telemetry 当前走：

- `handlePayloadCandidate(...)`
- `spool.enqueue(...)`
- `replayPending(...)`
- `publishRecord(...)`
- 关键行号：
  - `index.ts:1311`
  - `index.ts:1533`
  - `index.ts:1556`

这条链负责北向 MQTT 上行，不直接调用 `writeCommandToSerial(...)`。

当前实现含义：

- 当前需要治理的“发送路径”主要是 southbound command send path
- telemetry 主要是回读与北向 publish 路径
- 这轮 `node B` 的根因已经说明：主问题在命令发送前串口状态，而不是 payload 内容本身

## 3. 当前这条发送链已经补上的项与剩余边界

### 3.1 prewrite 串口清理已经落地

这轮对 `node B` 的 live proof 已经证明：

- 修复前 live `manual_collect` 样本出现过：
  - `4/5`
  - `1/2`
- 加入 prewrite `flush` 后：
  - `5/5`
  - `10/10`
  - 再补测 `1/1`
  全部拿到 `status=acked`

证据：

- [rk3568-b-live-proof-179-series-summary-20260413.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-b-live-proof-179-series-summary-20260413.json)
- [rk3568-b-live-proof-179-afterflush-summary-20260413.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-b-live-proof-179-afterflush-summary-20260413.json)
- [rk3568-b-live-proof-179-afterflush-soak-summary-20260413.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-b-live-proof-179-afterflush-soak-summary-20260413.json)

### 3.2 ACK quiet-window 已经成为实际运行时状态

最新 runtime 已经直接体现：

- `pendingCommandId`
- `pendingCommandType`
- `quietWindowUntilTs`
- `lastQuietWindowStartTs`
- `lastQuietWindowCloseTs`
- `lastQuietWindowCloseReason = acked`
- `quietWindowTimeouts = 0`

这说明 `field-gateway` 当前已经不再是“写完就结束”的粗放路径。

### 3.3 显式发送运行时状态已经落地

当前 `PortRuntimeState` 已不只是：

- `commandWrites`
- `lastCommandTs`
- `ackMessages`
- `lastAckTs`

同时还包括：

- `sendOwnerState`
- `pendingCommandId`
- `pendingCommandType`
- `pendingCommandDeviceId`
- `quietWindowUntilTs`
- `lastPrewriteQuietSatisfiedTs`
- `prewriteQuietTimeouts`
- `lastPrewriteFlushTs`
- `prewriteFlushFailures`

所以这条文档现在必须冻结一个更准确的说法：

- 发送链的第一轮中心侧 hardening 已经在 RK3568 上落地
- 对 `node B` 来说，主问题已经从“未知发送链缺口”收敛为“prewrite 串口状态”

### 3.4 当前剩余边界不在 `node B` 这条写链本身

当前真正还没收口的是：

- `node A` 和 `node C` 还没有进入中心侧 runtime 观测窗口
- 最新 runtime / observation 里，服务启动以来只看到了 `node B`

证据：

- [field-rk3568-gateway-runtime-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-runtime-latest.json)
- [field-rk3568-edge-link-quality-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-edge-link-quality-latest.json)
- [rk3568-observation-179-20260413.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/.tmp/rk3568-observation-179-20260413.json)

## 4. 当前最适合继续推进的位置

### 4.1 第一控制点

当前第一控制点仍然是：

- `handleMqttMessage(...)`

原因：

- 命令在这里已经完成 northbound 合同校验
- 也已经完成 device 到 port 的解析
- 这里仍然是未来若要继续加 queue / credit / retry policy 的入口

### 4.2 第二控制点

当前真正的底层发送闸口仍是：

- `writeCommandToSerial(...)`

原因：

- 所有 southbound command 最终都收束到这里
- 这轮 `prewrite flush` 就是在这里起效
- 后续若三节点实网下再次复发，这里仍是第一复查点

### 4.3 第三控制点

ACK 关闭发送窗口的天然入口仍是：

- `publishCommandAck(...)`

原因：

- 这里已经拿到了 `command_id`
- 这里已经完成 device / port 对应关系校验
- 当前也已经实际作为 quiet-window 关闭条件之一

## 5. 当前下一步边界

当前最合理的顺序已经不是“先大改 send path”，而是：

1. 让 `node A / node C` 重新进入中心侧 runtime
2. 基于当前已修复的 `field-gateway` 做真实三节点回归
3. 只有当三节点同在线时又重新出现 ACK 间歇失败，才把“共享流 contention / source-side control”重新拉回主诊断线

当前明确不做：

- 伪造 ACK
- 重写 northbound topic / schema 合同
- 把 `shared_port_scheduler` 旧实验重新当成当前主线
- 把 `node B` 的已修复问题重新描述成“根因未明”

## 6. 一句话结论

`services/field-gateway/src/index.ts` 当前 southbound command path 已经具备 per-port 发送态、prewrite quiet/flush 和 ACK 关闭窗口能力；对 `node B` 来说，间歇 ACK 的主问题已经定位并修在 RK3568 center-side，当前 blocker 已切换为 `node A / node C` 尚未进入中心侧 runtime。 
