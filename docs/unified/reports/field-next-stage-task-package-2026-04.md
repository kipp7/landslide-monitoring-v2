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
 - 当前正式入口现在补成：
   - `scripts/dev/run-field-rk3568-center-soak.ps1`
 - 对应总结报告：
   - `docs/unified/reports/field-rk3568-center-soak-latest.json`

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

当前下一阶段已经不应再表述为“先等 `node C` 再推进”，而应明确切换为：

1. 当前已成立的启动条件
- RK3568 板端 acceptance 单入口已经固定
- RK3568 长窗口观测单入口已经固定
- 双节点共享串流已经完成：
  - `120s`
  - `10 samples`
  - clean window
  - `schemaRejected delta = 0`
  - `publishFailures delta = 0`
  - `spoolPending max = 0`

2. `node C` 的当前定位
- 保留在：
  - `SOUTHBOUND_NODES_JSON`
  - 三节点容量预算
  - 后续同入口回归包
- 但不再作为：
  - 当前下一阶段启动 blocker

3. 当前应直接启动的工程包
- `RK3568 -> center` 软件适配与部署收口
- 更长窗口持续留证
- 三节点到位后的同入口回归验证

## 10.2 2026-04-09 更长窗口持续留证已补成 soak 入口

这轮把“继续积累更长窗口证据”从一句话任务，收成了正式脚本和报告线。

1. 新入口
- 脚本：
  - `scripts/dev/run-field-rk3568-center-soak.ps1`
- 当前用途：
  - 按轮次重复执行 `check-field-rk3568-center-operational-recovery.ps1`
  - 把每轮 recovery / closure / board clean-window 结果汇总成一份阶段报告

2. 当前总结报告
- `docs/unified/reports/field-rk3568-center-soak-latest.json`

3. 已实跑通过的当前最小证据
- `generatedAt = 2026-04-09T10:03:23Z`
- `accepted = true`
- `currentBoundary = rk3568-center-soak-ready`
- `rounds = 2`
- `acceptedRounds = 2`
- `cleanWindowRounds = 2`
- `maxBoardObservationSchemaRejectedDelta = 0`
- `maxParseFailureCount = 1`
- `allAcked = true`
- `allMetricsContractStable = true`

4. 这条证据的真实工程意义
- 当前不只是 recovery 单次通过
- 而是已经拿到一份真正有阶段意义的 `2` 轮 soak 证据：
  - 两轮都 `accepted = true`
  - 两轮都保持 `board clean window`
  - 两轮都 `acked`
  - 两轮都保持 `node A/B metricsKeyCount = 14`
  - 本轮 `maxClosureRetryCount = 0`
- 这意味着当前主线已经不只是“包装层可以救回瞬时抖动”
- 而是已经拿到了一段无需 wrapper retry 也能连续通过的更强 routine evidence

一句话总结：

- 当前主线已经从“等 node C 再推进”切到“node C 预留但不阻塞，先把 RK3568 到 center 的下一阶段收口继续做下去”

## 10.1 2026-04-09 下一阶段起点已从“待验证”进入“live closure 已通过”

这轮已经把前面定义的下一阶段真正跑穿，而不是停留在任务包层：

1. 新跨边界入口已落地
- `scripts/dev/check-field-rk3568-center-live-closure.ps1`

2. 新正式证据已生成
- `docs/unified/reports/field-rk3568-center-live-closure-latest.json`

3. 当前通过结论已固定
- `accepted = true`
- `currentBoundary = rk3568-live-center-closure-ready`
- `node A/B` live telemetry 可见于：
  - 直接 API 读路径
  - Web 代理读路径
- `node B manual_collect`
  - `commandId = 4ff5adb8-6beb-43fb-bae0-9555cc20c966`
  - 已在平台状态中对齐为：
    - `last_command_id`
    - `last_command_type = manual_collect`

4. 同时，这轮也把下一阶段真正的软件 blocker 定位并消掉了
- 不是串口路由问题
- 而是中心 `telemetry-writer` 对设备重启后的 `seq` 回退过于严格
- 当前已补成：
  - `seq` 回退
  - 且 `meta.uptime_s` 回退
  => 允许视为 reboot 后的新序列继续落库

因此，从这轮之后，下一阶段主线应进一步收窄为：

- 保持 `RK3568 -> center` live closure 入口冻结
- 继续累积更长现场窗口
- `node C` 到位后复用同一入口做三节点回归
