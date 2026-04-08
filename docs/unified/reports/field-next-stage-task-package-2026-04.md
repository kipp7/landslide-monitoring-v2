---
title: field-next-stage-task-package-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-next-stage-task-package-2026-04
---

# 现场主线下一阶段任务包（2026-04）

## 状态

- topic: `field-next-stage-task-package`
- state: `execution-package-frozen`
- updated_at: `2026-04-09`
- authority: `current`

## 1. 这份任务包解决什么问题

前面的 authority 已经分别收口了：

- 当前总方向
- 分阶段架构
- RK3568 网关任务单
- RK2206 固件任务单
- 中心部署任务单

但当前现场已经进入更具体的窗口：

- `node A/B` 在线
- `node C` 仍未到位
- RK3568 共享 `/dev/ttyS3` 已经能跑
- 但 strict deterministic command closure 还没有完全收干净

因此，这份文档只做一件事：

- 把“接下来这几天到底先做什么”压成单一执行包

## 2. 当前阶段真值

截至 `2026-04-09`，当前现场主线真值冻结为：

1. 拓扑真值
- `2 x RK2206` 已在线
- `node C` 预留但未接入
- `1 x center XL01 -> RK3568 /dev/ttyS3`
- 当前不是多物理串口扩展问题
- 而是：
  - 同一条 `/dev/ttyS3` 上的多节点共享流问题

2. RK3568 当前真值
- 正式源码同步部署线已成立
- 运行态快照入口已成立
- `field-gateway` 已具备：
  - southbound node mapping
  - port/node health
  - northbound telemetry publish
  - minimal command forward / ack publish

3. 当前共享流真值
- 新一轮 parser 候选过滤后，早期窗口可达到：
  - `schemaRejected = 0`
- 但 node `B manual_collect` 仍可能需要重试
- 当前剩余 dominant failure 仍然是：
  - `southbound-json-fragmentation`

4. 当前容量真值
- 三节点按 `5s` 上报预算：
  - telemetry 约 `31.25 MiB/day`
  - 保守预算约 `32.14-34.61 MiB/day`
  - 30 天约 `0.92 GiB`

## 3. 当前阶段目标

下一阶段不再按“再证明一次链路能通”推进，而按下面 3 个明确目标推进：

1. 把双节点共享口的噪声进一步压低
2. 为 `node C` 到位后的三节点验收提前写死规则
3. 把后续中心部署与产品侧对接准备成可直接衔接的下一包

## 4. 下一阶段唯一主线

从现在开始，当前主线压成一句话：

- 先用两天时间把 `A + B + /dev/ttyS3` 收到更稳定，再按固定验收包接入 `node C`，然后进入三节点共享流与中心部署收口

## 5. 第一包：node C 到货前两天

### 5.1 目标

- 不扩拓扑
- 不改 northbound contract
- 不重写部署入口
- 只继续收共享流稳健性

### 5.2 必做项

1. RK3568 parser / framing 窄补丁
- 继续只改：
  - `services/field-gateway/src/index.ts`
- 只接受：
  - 不扩大协议范围
  - 不引入厚适配
  - 不改 `telemetry/{device_id}` / `cmd/{device_id}` / `cmd_ack/{device_id}`

2. 双节点长窗口观测
- 固定拉更长时间窗的：
  - `schemaRejected`
  - `publishFailures`
  - `spoolPending`
  - `node A/B status`
  - `A/B telemetry continuity`

3. 严格区分两条入口
- 验收入口继续保留：
  - strict baseline
- 现场操作入口继续保留：
  - stable bounded-retry

### 5.3 完成标准

这一包算完成，至少要满足：

1. 新一轮补丁没有打断现有 northbound 上报和命令主线
2. 拿到一份双节点长窗口证据包
3. 当前 reject/noise 量级有更明确事实，而不是凭感觉判断

## 6. 第二包：node C 接入验收

### 6.1 接入前提

- `node C` 固件已烧录
- `device_id = 00000000-0000-0000-0000-000000000003`
- 通过中心 XL01 汇入同一条 `/dev/ttyS3`

### 6.2 验收顺序

1. 先看串流
- `/dev/ttyS3` 必须出现：
  - `device_id = ...0003`

2. 再看 health
- `runtime-health.json` 必须出现：
  - `node C = online`

3. 再看连续性
- 三节点至少连续 `10-15` 分钟 telemetry

4. 再看命令
- 先复跑：
  - `node B manual_collect`
- 再跑：
  - `node C manual_collect`

5. 最后看配置回归
- 至少做一次：
  - `set_config`

### 6.3 失败时的唯一判断顺序

如果 `node C` 验收失败，排查顺序固定为：

1. `node C` 是否真的出现在 `/dev/ttyS3`
2. `runtime-health.json` 是否识别 `node C`
3. 是否是 shared-stream fragmentation 升高
4. 是否是命令单次失败而非整体掉线

## 7. 第三包：三节点之后直接衔接的工程包

在 `node C` 真正上线后，不再回到“串口是不是能通”的层面，而直接进入下面 3 条并行包。

### 7.1 RK3568 网关包

聚焦：

- shared-stream hardening
- spool/retention 策略
- 运行指标与故障留证
- 后续显示屏 / 本地 sidecar 的边界预留

### 7.2 RK2206 固件包

聚焦：

- 第三节点固件参数一致性
- 传感器接入补齐
- 低功耗与采样/上报解耦
- 命令窗口与上报窗口继续工业化

### 7.3 中心部署包

聚焦：

- `RK3568 -> center server` 的正式部署线
- 平台组件运行/恢复策略
- 数据留存与容量边界
- 软件端接口验收保持与现有 contract 一致

## 8. 当前阶段不再纠缠的点

以下内容在这一阶段不再作为主讨论点：

1. 这台 Windows 电脑上的串口名是否变化
2. 单次 lucky pass 是否能代表稳定
3. 是否要现在就引入更重的边缘 AI / OpenClaw
4. 是否现在就引入新的平台接口

## 9. 当前阶段交付物

这份任务包冻结后，当前阶段的执行入口应统一挂到：

- [field-program-direction-and-task-split-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-program-direction-and-task-split-2026-04.md)
- [field-rk3568-rk2206-center-phased-architecture-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04.md)
- [field-rk3568-gateway-implementation-tasklist-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-implementation-tasklist-2026-04.md)
- [field-next-stage-task-package-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-next-stage-task-package-2026-04.md)

## 10. 当前结论

当前下一阶段不是“卡住等待硬件”，而是明确分成两段：

1. `node C` 到货前两天：
- 只收双节点共享流稳健性

2. `node C` 到货后：
- 按固定验收包切到三节点共享流

一句话总结：

- 不再散点试错，先用两天把双节点共享流证据补齐，再按固定顺序接入 `node C`，随后直接进入三节点网关/固件/中心部署收口
