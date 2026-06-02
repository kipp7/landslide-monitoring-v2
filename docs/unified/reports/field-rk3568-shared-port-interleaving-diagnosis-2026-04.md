---
title: field-rk3568-shared-port-interleaving-diagnosis-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-shared-port-interleaving-diagnosis-2026-04
---

# RK3568 共享串口交叠诊断基线（2026-04）

## 状态

- topic: `field-rk3568-shared-port-interleaving`
- state: `diagnosed-needs-source-side-control`
- updated_at: `2026-04-12`
- authority: `current`
- superseded_by_spec_change:
  - [add-shared-port-source-stream-control](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/openspec/changes/add-shared-port-source-stream-control/proposal.md)

## 1. 这份文档解决什么问题

当前 RK3568 主链已经证明：

- `lsmv2-field-gateway.service = active`
- `mqtt.connected = true`
- `serial.open = true`
- 命令转发和 ACK 回灌仍可闭合

但这并不等于：

- `3 节点共享 /dev/ttyS3` 已经达到工业级稳定

本诊断文档只解决一个问题：

- 把当前 `node A / node B` 掉线和 `schemaRejected` 增长的根因，收敛成明确的工程结论

## 2. 直接证据链

### 2.1 观测窗口结果

正式观测报告：

- [field-rk3568-gateway-observation-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-observation-latest.json)

关键事实：

- `passed = false`
- 在 60 秒窗口内：
  - `nodeA = degraded -> offline`
  - `nodeB = degraded -> offline`
  - `nodeC = online/degraded -> online`
  - `schemaRejected += 4`
  - `rejectedMessages += 4`
- 同时：
  - `serviceActive = true`
  - `mqttConnected = true`
  - `serialOpen = true`
  - `portOnline = true`
  - `spoolPending = 0`
  - `rejectedWriteFailures = 0`

这说明：

- 主进程和北向链路没有挂
- 失败集中在多节点共享南向串口的消息质量

### 2.2 严格 freeze 结果

正式 freeze 报告：

- [field-rk3568-production-uplink-freeze-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-production-uplink-freeze-latest.json)

关键事实：

- `accepted = false`
- `currentBoundary = rk3568-production-uplink-freeze-needs-review`
- `failureKeys` 仅剩：
  - `runtimeNodeAExpectedState`
  - `runtimeNodeBExpectedState`

这说明：

- 当前严格边界失败并不是服务级失败
- 失败集中在 `A/B` 遥测无法持续维持 `online|degraded`

### 2.3 rejected evidence 原始样本

RK3568 rejected spool 中最近样本已经直接显示：

- 一条 `node A` JSON 还在 `metrics.accel_...`
- 中途插入另一条 `node B` 的 `{"schema_version":1,...}`
- 后续字段继续交替穿插

这不是：

- 简单的两条 JSON 首尾相接
- 也不是单条 JSON 的尾残片

而是：

- 两条不同 `device_id` 的 payload 在同一 UART 字节流里发生了字节级交叠

## 3. 当前技术结论

### 3.1 这不是接收端 parser 的主问题

当前 `services/field-gateway/src/index.ts` 已经具备：

- 平衡括号提取
- `schema_version` anchor 扫描
- 仅保留可 `JSON.parse` 的候选
- telemetry / ack 分流
- rejected evidence 落盘

如果上游只是：

- 连包
- 粘包
- 启动残片

这些策略仍然有效。

但对于当前已确认的：

- 字节级交叠

接收端无法稳定无损恢复两条独立 JSON。

### 3.2 当前 blocker 已经上移到源侧串流约束

因此当前主 blocker 不是：

- 再写更多 JSON 恢复 heuristics

而是：

- 中心 XL01 / 南向汇聚路径是否保证单包串行发送
- 多节点上报节拍是否被同步到会发生碰撞
- 共享 UART 是否需要显式 framing / queue discipline

## 4. 当前工程判定

当前应把 RK3568 侧状态判定为：

- `运行链在线`
- `命令链可用`
- `单节点/低冲突窗口可工作`
- `多节点共享口工业级稳定性未收口`

换句话说：

- 不能把当前问题继续包装成“接收端还差一点 parser 优化”
- 必须把它提升为：
  - `source-side serialization problem`

## 5. 当前 authority baseline

从 `2026-04-12` 起，这类故障的正式工程口径冻结为：

- 主问题属于 `source-side stream control`
- 不是 `parser-first recovery`

共享 southbound 串口若承载多节点流量，必须满足：

1. 单写者串行化
- 任意时刻仅允许一条逻辑消息占有写窗口
- 未完整写出的消息不得被第二条消息插入字节流

2. 命令 ACK 静默窗
- 命令写出后，必须为 ACK/回执保留 quiet window
- quiet window 内不得把无关 telemetry 注入同一共享流

3. 错峰只作为辅助优化
- `5/7/11` 或其他错峰周期 MAY 降低碰撞概率
- 但只要 `interleavingSuspected` 继续增长，就不得宣布 closure

## 6. 下一阶段应该做什么

### 6.1 立即优先级

1. 核查中心 XL01 转发路径
- 是否把来自 A/B/C 的多节点消息放进同一串口写窗口
- 是否存在无队列化的透明转发

2. 核查节点发送节拍
- `A/B/C` 是否在同频率、同相位上报
- 是否需要错峰

3. 核查协议边界
- 当前 bare JSON 是否足够
- 是否必须引入明确帧边界或单包写保证

### 6.2 暂不优先做的事

- 继续在 RK3568 接收端堆更多 JSON 修补逻辑
- 仅靠放宽 `nodeOfflineAfterMs` 掩盖真实丢包
- 把 `A/B offline` 误判成 MQTT 或 systemd 故障

## 7. 后续 closure 的最小验收证据

未来如果宣称共享口已经达到生产稳定性，至少必须同时提供：

1. 共享口观测窗口证据
- [field-rk3568-gateway-observation-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-observation-latest.json)
- 一个明确时间窗内：
  - `interleavingSuspected` 不增长
  - `interleavingWithMultipleSchemas` 不增长
  - `interleavingWithMultipleDeviceIds` 不增长
  - `schemaRejected` / `rejectedMessages` 不增长或满足冻结边界
  - 节点状态维持在可接受范围

2. 命令闭环证据
- `run-rk3568-field-gateway-node-command-proof.ps1` 最新 proof
- 至少应证明：
  - `command forwarded to serial`
  - ACK 证据闭合
  - ACK payload 未被共享流互串污染

3. 共享口对比证据
- 若仍保留错峰策略，必须同时给出：
  - 无 source-side control 时的失败基线
  - source-side control 落地后的改进结果

若缺少以上证据，不得把共享口状态描述为“稳定可交付”。

## 8. 对后续主线的影响

对当前总主线的影响应冻结为：

- 中心部署线仍然可继续复用
- Desk/软件适配线仍然可以继续推进
- RK3568 command path 不需要回退
- 下一轮南向硬化必须优先处理共享口源侧约束

因此，下一轮 RK3568 主线不应命名为：

- `继续优化 parser`

而应命名为：

- `shared-port source-stream control`
