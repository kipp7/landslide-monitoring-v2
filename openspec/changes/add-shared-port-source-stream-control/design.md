---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-shared-port-source-stream-control/design
---

## Context

当前 RK3568 共享 `/dev/ttyS3` 路径已经具备：

- 多节点 southbound mapping
- 命令转发
- ACK 发布
- rejected evidence
- `interleavingSuspected` 系列统计

但正式诊断和错峰实验已经证明：

- 共享口字节级交叠仍在增长
- `node A/B` 会在观测窗口内降为 `degraded` 或 `offline`
- `5/7/11` 这类简单错峰不能把共享口稳定下来
- ACK payload 本身也会在共享流里被污染

因此当前需要冻结的是 source-side control contract，而不是继续尝试接收端补丁。

## Goals

- 明确共享口生产约束必须落在源侧串流控制
- 冻结单写者串行化与完整帧写入要求
- 冻结命令后的 ACK 静默窗要求
- 冻结共享口 readiness 的正式验收口径
- 为后续中心 XL01 / RK3568 的实现留出清晰边界

## Non-Goals

- 不继续扩展 parser heuristic 作为主线方案
- 不定义具体 MCU / OpenHarmony API 写法
- 不改变现有 northbound MQTT 与平台存储契约
- 不在本轮决定所有可能的周期组合或无线链路参数

## Decisions

### Decision: Receive-side recovery is no longer the primary fix path

接收端可以继续保留：

- rejected evidence
- interleaving counters
- 基本 framing recovery

但它不再被视为解决共享口稳定性的主路径。

### Decision: Shared southbound transports require single-writer serialization

只要多个节点的 payload 会通过一个共享 southbound serial path 转发，就必须满足：

- 任意时刻只允许一个逻辑消息占有写窗口
- 一个逻辑消息未完整写出前，不允许另一条消息插入其字节流
- 实现可以在中心 XL01、RK3568 边缘适配器或两者协同完成

### Decision: First-version implementation seam belongs to the RK3568 `field-gateway` send path on `/dev/ttyS3`

当前真实部署拓扑里，主仓内已经落板、已被 proof 证实、且可直接继续实现的 southbound 控制点是：

- `services/field-gateway/src/index.ts`
- `handleMqttMessage(...) -> resolveNodeForCommand(...) -> writeCommandToSerial(...)`
- `handlePayloadCandidate(...) -> publishCommandAck(...)`

因此第一版实现 ownership 固定为：

- 不继续把“中心侧 RK2206 烧录”当成当前默认主线
- 不把 RK3568 继续当作 parser-only 观测点
- 直接在 RK3568 `field-gateway` 的 `/dev/ttyS3` send path 上引入：
  - southbound 单写者串行化
  - 命令优先级仲裁
  - ACK quiet-window 期间的后续命令注入控制
  - send-path 运行时状态与 proof 对齐

原因：

- 当前 repo 内真正可改、可部署、可回归的入口就在这条 send path 上
- 命令干扰 ACK 观察窗的问题，首先体现在 RK3568 向中心 XL01 的 southbound 注入时机上
- 继续回到未落板的中心侧烧录线，会让当前主线再次失焦

这里的边界要写清楚：

- RK3568 不能把已经损坏的上行碎片“恢复成稳定历史”
- 但 RK3568 完全可以治理当前 southbound command send path
- 当前 change 的第一落点就是这条 send path，而不是新增一条中心固件实施前提

### Decision: Command forwarding must reserve an ACK quiet window

命令下发后，源侧必须为 ACK 或回执窗口保留静默期。

在静默窗内：

- 不得让无关 telemetry payload 插入同一 southbound stream
- 必须等待 ACK 到达、窗口超时或明确失败后，才允许恢复普通队列

第一版工程基线固定为：

- `manual_collect`
- `set_config`

这两类命令进入高优先级命令通道后：

1. 完整写出命令帧
2. 进入 quiet-window
3. quiet-window 内冻结普通周期 telemetry 直通发送
4. 只允许：
   - 对应 ACK
   - 与该命令直接相关的必要结果帧
5. quiet-window 在以下条件之一满足后结束：
   - 观察到匹配 `command_id` 的 ACK
   - 达到命令超时上限
   - 命令被明确标记为失败

第一版建议的工程超时基线：

- ACK quiet-window budget:
  - `10s` hard timeout

这个值不是长期最优值，而是当前基于现场 proof 和污染风险给出的保守起点，目的是先证明共享流不会再被普通 telemetry 打断。

### Decision: The center XL01 queue must be small and policy-driven

中心 XL01 不应承担长期存储职责，但必须承担短时仲裁职责。

第一版队列策略固定为：

- 每个分节点保留一个 `normal telemetry latest-value slot`
- 全局保留一个 `command lane`
- 全局保留一个 `ack/result lane`

对应流量策略：

1. 普通周期 telemetry
- 允许 latest-value-wins 覆盖
- 不要求全量历史逐条保留
- 同一节点新值到达时，覆盖该节点尚未释放的旧值

2. 命令 ACK / 命令结果
- 不得因普通 telemetry 挤压而丢弃
- 必须优先于普通 telemetry 释放

3. 告警类或人工触发即时结果
- 若与命令闭环直接相关，按 ACK/result lane 处理
- 否则在第一版中仍按高于普通 telemetry、低于 ACK 的优先级处理

这意味着：

- XL01 只需要极小缓冲
- 不需要承担数据库式历史留存
- 但必须保证“不会因为没有仲裁而把字节流打坏”

### Decision: Cadence staggering is secondary mitigation only

节点错峰上报 MAY 被用来降低冲突概率，但它：

- 不能替代单写者串行化
- 不能在 interleaving counters 仍增长时被宣布为 closure
- 只能作为源侧控制完成后的辅助优化项

第一版建议保留当前 `5s` 常规上报节奏，不把周期组合优化当作先决条件。
若后续需要再做错峰，应在 source-side serialization 已生效之后，再将其作为减压项单独评估。

### Decision: Shared-port readiness must be judged by evidence, not service liveness alone

共享口 readiness 不能只看：

- service active
- mqtt connected
- serial open

还必须看：

- `interleavingSuspected`
- `interleavingWithMultipleSchemas`
- `interleavingWithMultipleDeviceIds`
- `schemaRejected`
- `rejectedMessages`
- 节点 `online/degraded/offline`

只有这些指标在观测窗口内满足边界，才能认为共享口达到了生产稳定性。

## Risks / Trade-offs

- 强制单写者串行化会增加源侧实现复杂度与时延管理成本
- ACK 静默窗若设置过长，会压缩普通 telemetry 吞吐
- send path 串行化会增加 RK3568 命令路径的状态管理复杂度
- 若继续忽略 source-side control，接收端指标会继续恶化，并且命令 proof 会长期处于“forwarded but ack unreliable”
- latest-value-wins 会在拥塞窗口下牺牲部分普通 telemetry 历史点位，但这是当前优于“把共享流彻底打坏”的选择

## First-Version Control Contract

### Traffic classes

第一版只定义三类流量：

1. `command`
- 例如：
  - `manual_collect`
  - `set_config`

2. `ack_or_result`
- 与命令 `command_id` 直接相关的 ACK 或结果

3. `normal_telemetry`
- 周期上报
- 非命令闭环必需的普通数据

### Scheduler behavior

第一版调度器行为固定为：

1. 若 `ack_or_result` 待发，先发 `ack_or_result`
2. 否则若 `command` 待发，发 `command` 并立即进入 quiet-window
3. 否则按节点轮询释放 `normal_telemetry latest-value slot`

### Overflow behavior

第一版溢出策略固定为：

- `command`: 不覆盖，不丢弃，必须进入发送或失败路径
- `ack_or_result`: 不允许被普通 telemetry 覆盖
- `normal_telemetry`: 同节点只保留最新一条，旧值可覆盖

### Acceptance target

第一版 source-side control 落地后，最小目标不是“零延迟”，而是：

- shared-port interleaving counters 在观测窗口内停止增长
- ACK 证据闭合
- 节点状态稳定在可接受范围

## Migration Plan

1. 先冻结本次 spec
2. 再把中心 XL01 / RK3568 source-side control boundary 写入 authority 文档与 runbook
3. 最后再做实现与 proof：
   - 序列化写窗
   - ACK 静默窗
   - 共享口 readiness 验收
