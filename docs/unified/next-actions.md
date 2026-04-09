---
title: next-actions
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/next-actions
---

# 后续动作统一建议

## 1. 当前阶段总策略

当前不再停留在“链路还能不能通”的证明阶段，而是正式切到：

- `RK2206 A/B -> center XL01 -> RK3568 -> center server -> API/Web`
- 中心部署与软件适配收口
- `node C` 继续预留，但不是当前 blocker

当前阶段的准入基线已经冻结为：

- `field-center-compose-acceptance-latest.json`
- `field-rk3568-center-operational-recovery-latest.json`
- `field-rk3568-center-soak-latest.json`
- `field-center-deployment-software-adaptation-readiness-latest.json`

## 2. 当前真值

- 中心 compose 主链已经通过 acceptance，`ingest-service` 和 `telemetry-writer` 已回到正式运行线
- RK3568 受控恢复入口和 soak 入口已经固定
- 双节点 `A/B` 当前 API/Web 指标合同保持精确 `14` 个 canonical metrics key
- `node C` 已冻结到配置位和容量预算：
  - `device_id = 00000000-0000-0000-0000-000000000003`
  - 当前不阻塞中心部署与软件适配推进
- 三节点预算继续按冻结口径执行：
  - `31.25 MiB/day` 原始量
  - `32.14-34.61 MiB/day` 保守预算
  - `30` 天约 `0.92 GiB`

## 3. 推荐执行顺序

### 阶段 A：冻结中心部署运行线

目标：

- 把中心侧从“能跑”收成“能稳定恢复、能重复交付”

建议动作：

- 固定 compose 常驻组件、环境变量来源、恢复顺序
- 统一使用：
  - `check-field-center-compose-acceptance.ps1`
  - `check-field-center-deployment-software-adaptation-readiness.ps1`
- 以 `docs/guides/runbooks/single-host-runbook.md` 作为现场恢复手册

### 阶段 B：推进 RK3568 到中心服务器的软件适配

目标：

- 把 RK3568 的正式上行环境和中心部署线绑定死
- 保持现有 northbound contract，不引入厚适配层

建议动作：

- 固定 RK3568 上行 broker/env/config
- 复用现有 `telemetry/{device_id}`、`cmd/{device_id}`、`cmd_ack/{device_id}`
- 继续用 recovery/soak 入口做现场边界复核

### 阶段 C：推进软件侧接口对接

目标：

- 让 API/Web/后续桌面端都以当前现场合同为准

建议动作：

- 对齐 A/B 双节点当前字段合同
- 保持 `14` 个 canonical metrics key 不漂移
- 以中心部署 readiness 报告作为软件适配入口，而不是再回头争论串口细节

### 阶段 D：为 node C 预留回归位

目标：

- 不等待硬件到位，但提前把容量、配置、验收顺序冻结

建议动作：

- 保留 `node C` 在 `SOUTHBOUND_NODES_JSON`
- 保留三节点预算
- 到货后复用现有 recovery/soak/readiness 入口回归

## 4. 当前最优先的三件事

### 第一优先级：中心部署运行线冻结

- 把 compose、env、恢复顺序、证据入口固定下来

### 第二优先级：RK3568 到中心服务器的软件适配

- 把板端正式配置和平台部署线绑到一起

### 第三优先级：软件端合同对接

- 确保 API/Web/Desk 后续都消费同一份现场合同

## 5. 当前不建议继续纠缠的点

- 不继续把时间耗在 Windows 串口命名变化上
- 不继续追求当前阶段 strict zero-noise 的终局证明
- 不等待 `node C` 才启动中心部署与软件适配
- 不在这一阶段引入新的协议层或边缘 AI 厚能力

## 6. 当前推荐的下一轮任务拆分

### 任务 1：中心部署 readiness

- 输出：
  - `docs/unified/reports/field-center-deployment-software-adaptation-readiness-latest.json`

### 任务 2：RK3568 正式上行适配

- 输出：
  - 板端 env/runtime 固化结果
  - 与中心侧对接的复跑证据

### 任务 3：软件侧接口与产品读路径对齐

- 输出：
  - 当前 A/B 节点字段合同对齐结论
  - 后续 Desk/前端适配切入点

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
