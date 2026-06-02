---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-central-polling-control/design
---

## Context

当前仓内已经具备：

- `field-link` framed transport
- `field-gateway` command prewrite quiet + command ACK quiet-window
- `RK2206` 节点 ACK 构造、命令解析、telemetry envelope 构造

但当前 still-missing 的关键控制面是：

- `RK3568` 还没有对 `A/B/C` 持有真正的 round-robin poll scheduler
- edge node 仍然默认自由周期上报
- 网关在命令 ACK 到达后，还没有继续持有“等待该节点 telemetry 返回”的 poll session

## Goals

- 明确 `RK3568` 是共享南向链路的唯一调度 owner
- 明确 edge node polling mode 的行为边界
- 为共享链路建立“ACK 后继续等 telemetry” 的完整 poll session
- 让 operator command 和内部 poll 共享同一条控制窗口
- 保持北向平台合同不变

## Non-Goals

- 不继续把 parser-first 作为主线
- 不要求中心 XL01 具备复杂缓冲或全局状态机
- 不追求在拥塞下保留 every telemetry history point

## Decisions

### Decision: `RK3568` owns the shared-link polling token

对于 `RK2206 A/B/C -> center XL01 -> RK3568 /dev/ttyS3` 这条链路，只有 `RK3568` 具备：

- 全局可见的节点状态
- northbound / southbound 双向上下文
- 持续在线运行时
- 可维护的队列和超时状态

因此第一版正式 owner 固定为 `RK3568 field-gateway`。

### Decision: Edge nodes keep sampling locally but do not free-run onto the shared uplink in polling mode

Polling mode 下，边缘节点 SHALL：

- 继续本地传感器采样
- 保持最新 telemetry snapshot
- 仅在以下两类事件下发送 telemetry：
  - operator `manual_collect`
  - gateway internal poll command

这意味着 shared uplink 上的普通 telemetry 变成按需释放，而不是自由竞争。

### Decision: Poll session continues after ACK until target telemetry or timeout

共享链路里真正需要保护的不是只有 ACK。

对于内部 poll command：

1. gateway 发 command
2. 节点 ACK
3. gateway 保持 active poll session
4. 只在观察到目标节点 telemetry 或 poll timeout 后，才允许切到下一节点

否则就会再次出现：

- ACK 成功
- 但下一条控制流提前插入
- poll telemetry 窗口被污染

### Decision: Operator commands and internal poll share one control window

第一版仲裁规则固定为：

1. operator command 优先于内部 poll
2. 若当前存在 active poll telemetry session：
- 新控制写入必须等待该 session 结束或 timeout
3. poll scheduler 只在以下条件都满足时才允许发下一轮：
- 串口 open
- 无 pending command window
- 无 active poll telemetry session
- 无排队中的 operator command

### Decision: Internal poll commands are southbound-only control traffic

内部 poll command 由 `field-gateway` 自行生成，用于共享链路调度，不要求平台页面显式感知。

第一版实现允许：

- southbound 使用专用 `command_type`
- gateway 抑制该 internal poll ACK 的 northbound 发布
- northbound 继续只消费正常 telemetry 与 operator-driven ACK

## Risks / Trade-offs

- Polling mode 会牺牲自由上报吞吐，换取共享链路稳定性
- 内部 poll ACK 抑制需要额外状态管理
- operator command 在 poll telemetry session 内可能增加等待时延
- 若 edge node 未刷入 polling-mode firmware，scheduler 只能部分收效

## Migration Plan

1. 撤回临时错峰实验
2. 给 RK2206 加入 polling mode
3. 给 RK3568 `field-gateway` 加入 internal poll scheduler 和 poll session
4. 再做三节点共享链路实测 closure
