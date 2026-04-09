---
title: next-actions
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/next-actions
---

# 后续动作统一建议

## 1. 当前阶段总策略

当前不再停留在“链路还能不能通”的证明阶段，而是已经完成三条阶段门，正式切到：

- `RK2206 A/B -> center XL01 -> RK3568 -> center server -> API/Web`
- 中心部署集成与软件消费侧适配
- `node C` 继续预留，但不是当前 blocker

当前阶段的准入基线已经冻结为：

- `field-center-compose-acceptance-latest.json`
- `field-rk3568-center-operational-recovery-latest.json`
- `field-rk3568-center-soak-latest.json`
- `field-center-deployment-software-adaptation-readiness-latest.json`
- `field-center-runtime-freeze-latest.json`
- `field-rk3568-production-uplink-freeze-latest.json`
- `field-software-read-path-adaptation-latest.json`

## 2. 当前真值

- 中心 compose 主链已经通过 acceptance，`ingest-service` 和 `telemetry-writer` 已回到正式运行线
- RK3568 受控恢复入口和 soak 入口已经固定
- 中心运行线冻结、RK3568 正式上行冻结、软件读路径适配都已经转绿
- 双节点 `A/B` 当前 API/Web 指标合同保持精确 `14` 个 canonical metrics key
- `node C` 已冻结到配置位和容量预算：
  - `device_id = 00000000-0000-0000-0000-000000000003`
  - 当前不阻塞中心部署与软件适配推进
- 三节点预算继续按冻结口径执行：
  - `31.25 MiB/day` 原始量
  - `32.14-34.61 MiB/day` 保守预算
  - `30` 天约 `0.92 GiB`

## 3. 推荐执行顺序

### 阶段 A：落实中心部署交接线

目标：

- 把中心侧从“已冻结”继续推进到“可交接、可复跑、可部署”

建议动作：

- 继续沿单机部署 runbook 收口部署和恢复动作
- 统一使用：
  - `check-field-center-runtime-freeze.ps1`
  - `check-field-center-deployment-software-adaptation-readiness.ps1`
- 以 `docs/guides/runbooks/single-host-runbook.md` 作为现场恢复手册

### 阶段 B：维持 RK3568 正式上行冻结线

目标：

- 保持板端 env/runtime 持续绑定中心部署线
- 不为当前阶段引入新的协议层或中间转换层

建议动作：

- 复用 `check-field-rk3568-production-uplink-freeze.ps1`
- 复用现有 `telemetry/{device_id}`、`cmd/{device_id}`、`cmd_ack/{device_id}`
- 仅在板端配置或现场链路变化时做复核

### 阶段 C：推进软件消费侧适配

目标：

- 让 API/Web/后续 Desk 都消费同一份冻结现场合同

建议动作：

- 以 `check-field-software-read-path-adaptation.ps1` 作为读路径边界
- 保持 `14` 个 canonical metrics key 不漂移
- 继续围绕 `/api/v1/devices` 与 `/api/v1/data/state/{deviceId}` 做消费端适配

### 阶段 D：为 node C 预留回归位

目标：

- 不等待硬件到位，但提前把容量、配置、验收顺序冻结

建议动作：

- 保留 `node C` 在 `SOUTHBOUND_NODES_JSON`
- 保留三节点预算
- 到货后复用现有 recovery/soak/readiness 入口回归

## 4. 当前最优先的三件事

### 第一优先级：中心部署交接与复跑

- 把部署、恢复、交接动作继续固化到 runbook 和验证入口

### 第二优先级：软件消费侧按冻结合同继续接入

- 让 Web/Desk/后续界面都稳定依赖当前主读路径与字段合同

### 第三优先级：保留 node C 回归位

- 保持三节点容量、配置、接入顺序不漂移，等待硬件到位直接复用现有入口

## 5. 当前不建议继续纠缠的点

- 不继续把时间耗在 Windows 串口命名变化上
- 不继续追求当前阶段 strict zero-noise 的终局证明
- 不等待 `node C` 才启动中心部署与软件适配
- 不在这一阶段引入新的协议层或边缘 AI 厚能力

## 6. 当前推荐的下一轮任务拆分

### 任务 1：中心部署交接包

- 输出：
  - runbook 化的单机部署/恢复执行线
  - 与当前 freeze/readiness 对齐的交付说明

### 任务 2：软件消费侧适配包

- 输出：
  - API/Web/Desk 统一消费当前设备状态主读路径
  - 双节点 A/B 现场合同不漂移的持续验证点

### 任务 3：RK3568 运行线守护包

- 输出：
  - 板端正式 env/runtime 的守护复核
  - southbound A/B/C 配置位不漂移

### 任务 4：node C 预留回归包

- 输出：
  - 配置保留
  - 容量保留
  - 接入后的同入口回归顺序

## 7. 当前建议的协作方式

- 主开发仓继续作为唯一写入主线
- 只对 scoped 文件提交，不碰无关脏改
- 每次阶段切换先更新 `docs/unified/next-actions.md`
- 每次完成任务补：
  - `memory/tasks/`
  - `docs/journal/`

## 8. 本文件的作用

本文件是当前阶段的执行顺序确认，不是长期路线图。

如果阶段边界再次发生变化，应继续按当前写法刷新为新阶段入口，而不是回退到通用建议。
