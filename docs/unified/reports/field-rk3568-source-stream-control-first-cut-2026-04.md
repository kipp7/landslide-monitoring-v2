---
title: field-rk3568-source-stream-control-first-cut-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-source-stream-control-first-cut-2026-04
---

# RK3568 共享口源侧控制一版方案（2026-04）

## 状态

- topic: `field-rk3568-source-stream-control-first-cut`
- state: `implementation-entry-ready`
- updated_at: `2026-04-12`
- authority: `current`
- related_change:
  - [add-shared-port-source-stream-control](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/openspec/changes/add-shared-port-source-stream-control/proposal.md)

## 1. 目标

这份文档不再讨论“是不是应该做源侧控制”，而是直接给出第一版可实施方案：

- 谁负责
- 队列多大
- 哪些数据允许覆盖
- 哪些数据绝不能丢
- 调度顺序是什么

## 2. Ownership

第一版 ownership 固定为：

- 中心 XL01
  - 主控制点
  - 负责单写者串行化
  - 负责命令优先级
  - 负责 ACK quiet-window
  - 负责小队列仲裁
- RK3568
  - 观察与验收点
  - 负责 runtime health / rejected evidence / interleaving counters
  - 负责北向上传和平台适配

判定理由：

- 互串发生在上游 source-side byte stream
- RK3568 位于污染流下游
- 下游观察可以证明问题，但不能稳定修复已被打坏的字节流

## 3. 流量分级

第一版只保留三类流量：

### 3.1 `command`

包括：

- `manual_collect`
- `set_config`

### 3.2 `ack_or_result`

包括：

- 与某次 `command_id` 直接对应的 ACK
- 与本次命令闭环直接相关的即时结果帧

### 3.3 `normal_telemetry`

包括：

- 普通 5s 周期数据
- 不属于当前命令闭环必需结果的常规上报

## 4. 队列模型

中心 XL01 第一版不做长期存储，只做小队列。

### 4.1 每节点普通 telemetry 槽

每个分节点保留：

- 1 个 `latest-value slot`

规则：

- 若该节点新 telemetry 到达而旧值尚未发出
- 新值覆盖旧值

目的：

- 防止普通 telemetry 无上限堆积
- 避免为了保全历史点位而把共享流再次打坏

### 4.2 全局命令槽

全局保留：

- 1 条当前待发命令

规则：

- 命令不得被普通 telemetry 覆盖
- 若需要多命令，进入明确的命令队列或失败路径，不得与普通 telemetry 混发

### 4.3 全局 ACK / 结果槽

全局保留：

- 1 条当前最高优先级 `ack_or_result`

规则：

- 优先级高于所有普通 telemetry
- 不允许被普通 telemetry 挤掉

## 5. 调度顺序

第一版固定调度顺序：

1. 若存在 `ack_or_result`，先发 `ack_or_result`
2. 否则若存在 `command`，发 `command`
3. 发出 `command` 后立即进入 quiet-window
4. quiet-window 结束前，不释放普通 telemetry
5. quiet-window 结束后，再按节点轮询释放 `normal telemetry latest-value slot`

## 6. Quiet-Window 基线

### 6.1 进入条件

当共享口发出以下命令之一时进入 quiet-window：

- `manual_collect`
- `set_config`

### 6.2 quiet-window 内允许的流量

只允许：

- 与当前 `command_id` 对应的 ACK
- 与当前命令直接相关的必要结果帧

不允许：

- 无关节点普通 telemetry 抢占共享流

### 6.3 退出条件

quiet-window 在以下条件之一满足后结束：

- 观察到匹配 `command_id` 的 ACK
- 到达超时上限
- 命令被明确标记为失败

### 6.4 第一版超时基线

- `10s` hard timeout

这不是长期最优值，而是当前用于“先证明共享流不会再被普通 telemetry 打断”的保守工程基线。

## 7. 丢弃与保留策略

### 7.1 绝不能丢

- `command`
- `ack_or_result`

### 7.2 允许覆盖

- `normal_telemetry`
  - 只允许同节点 latest-value 覆盖
  - 不要求逐条历史完整保留

### 7.3 当前工程取舍

当前取舍是：

- 宁可牺牲部分普通 telemetry 历史点位
- 也不能继续让共享流字节互串，导致：
  - ACK 不闭合
  - JSON 坏包
  - 节点状态降级

## 8. RK3568 验收职责

RK3568 不负责主仲裁，但负责验收。

第一版 source-side control 落地后，RK3568 至少要证明：

1. 共享口观测窗口内：
- `interleavingSuspected` 不增长
- `interleavingWithMultipleSchemas` 不增长
- `interleavingWithMultipleDeviceIds` 不增长

2. 命令 proof：
- `command forwarded to serial`
- ACK 证据闭合
- ACK payload 未被共享流污染

3. 节点状态：
- 不再在观测窗口内降为 `degraded/offline`

## 9. 实现入口

第一版实现不建议从 RK3568 parser 下手，而建议从中心 XL01 做下面三步：

1. 建立单写者 southbound 发送器
2. 建立命令发出后的 quiet-window 状态机
3. 给普通 telemetry 加 latest-value slot

这三步做完后，再回到 RK3568 侧复跑 proof 和 observation。
