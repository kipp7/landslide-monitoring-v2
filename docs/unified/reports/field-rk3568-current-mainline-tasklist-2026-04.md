---
title: field-rk3568-current-mainline-tasklist-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-current-mainline-tasklist-2026-04
---

# RK3568 当前主线任务单（2026-04）

## 状态

- topic: `field-rk3568-current-mainline-tasklist`
- state: `current-mainline-tasklist-central-polling-rebased`
- updated_at: `2026-04-13`
- authority: `current`

## 1. 当前真实架构

当前主线固定为：

- `分节点 RK2206 A/B/C`
- `-> 中心 XL01`
- `-> RK3568 /dev/ttyS3`
- `-> MQTT / API / Web`

因此，当前 RK3568 要处理的是：

- 单一 `/dev/ttyS3` 上的中心汇聚流
- 按 `device_id` 区分 `A/B/C`
- southbound poll / command send path
- northbound telemetry / `cmd_ack` publish

## 2. 当前已经冻结的主线结论

### 2.1 主方案已经从“自由上报 + 修 ACK”切换为“RK3568 中心轮询 / token”

当前 authoritative 结论：

1. `parser recovery`
- 只能保留为观测/证据能力
- 不能继续承担主修复路径

2. 节点固定错峰
- 只能作为辅助减压
- 不能继续承担正式 closure

3. 最适合当前真实拓扑的唯一主线是：
- `RK3568` 持有全局 poll/token 调度权
- `RK2206 A/B/C` 只保留本地采样与最新值缓存
- shared uplink 只在被轮询或人工触发时释放 telemetry

### 2.2 当前共享链路控制边界

当前正式控制边界固定为：

- `RK3568 field-gateway`
- 不是中心 `XL01`
- 也不是继续扩 parser-first heuristic

当前第一版工程语义固定为：

1. internal poll command：
- `poll_latest_telemetry`

2. poll session：
- 发 poll command
- 等 ACK
- ACK 后继续等目标节点 telemetry 或 timeout

3. control arbitration：
- operator command 高于 internal poll
- 二者共享同一条 southbound control window

## 3. 当前不再继续投入的线

以下路线当前不再作为 RK3568 主线：

1. `shared_port_scheduler`
- 已标记为废弃实验线
- 不再作为当前主线的 ownership

2. 纯 `5/7/11` 错峰
- 不再写成主方案

3. 继续把“只修 ACK”当成当前阶段目标
- 当前阶段已经上升到共享链路整体控制

4. 把中心 `XL01` 视为可编程仲裁器
- 当前真实硬件不支持这条假设

## 4. RK3568 当前主线任务包

### 4.1 P0：保持当前已落板能力不回退

必须保持当前能力不退化：

- `/dev/ttyS3` 在线
- MQTT 在线
- telemetry publish 正常
- `cmd_ack` publish 正常
- prewrite quiet/flush 运行态保持有效
- `field-link` framed transport 可继续使用

关键实现入口：

- [index.ts](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/services/field-gateway/src/index.ts)

### 4.2 P1：把中心轮询 / token 第一版落到 `field-gateway`

直接目标：

- 支持 `SOUTHBOUND_POLLING_ENABLED`
- 支持 internal poll command
- 端口上一次只允许一个 active poll session
- poll ACK 后继续等待目标 telemetry

### 4.3 P2：把 edge node 改成 polling uplink mode

直接目标：

- 节点继续本地采样
- shared uplink 不再自由周期直推
- 支持 `poll_latest_telemetry`
- 人工 `manual_collect` 保持兼容

### 4.4 P3：三节点实测验证

在 `A/B/C` 都刷入 polling-mode firmware 后，统一复跑：

- internal poll scheduler
- operator `manual_collect`
- operator `set_config`

同时观察：

- `internalPollCommandsIssued`
- `internalPollTelemetryMatches`
- `internalPollSessionTimeouts`
- `ackMessagesPublished`
- `rejectedMessages`
- `interleavingSuspected`
- 各节点 `lastTelemetryTs`

## 5. 当前顺序化执行清单

1. 撤回 RK2206 临时错峰实验
2. 冻结 `RK3568 中心轮询 / token` 方案
3. 在 `field-gateway` 落 internal poll scheduler + poll session
4. 在 RK2206 样例落 polling uplink mode
5. 更新 `.env.example` / RK3568 deploy example / README
6. 重新刷 `A/B/C`
7. 再跑三节点 observation / command proof / telemetry closure

## 6. 当前阶段完成标准

当前这一阶段完成，至少要满足：

1. `A/B/C` 在 polling mode 下都能被中心稳定轮询
2. internal poll 下 `A/B/C` telemetry 可重复闭合
3. operator `manual_collect` / `set_config` 仍可重复成功
4. `rejectedMessages = 0` 或不持续增长
5. `interleavingSuspected = 0` 或不持续增长
6. `internalPollSessionTimeouts` 处于可接受范围
7. 当前 RK3568 中心版本可被冻结为正式现场主线

## 7. 一句话冻结

RK3568 当前主线已经切换为“中心轮询 / token + edge polling uplink mode”；后续所有 shared-link 稳定性工作，都应优先沿这条控制面推进，而不是再回到 parser-first 或固定错峰主线。
