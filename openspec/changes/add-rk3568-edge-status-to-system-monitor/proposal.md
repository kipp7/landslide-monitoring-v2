---
title: proposal
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-edge-status-to-system-monitor/proposal
---

## Why

当前 RK3568 现场主线已经具备稳定的只读运行证据：

- `field-link-monitor` 可给出板端链路质量摘要
- `field-gateway` 可给出多节点 runtime health
- `center soak` 已能证明当前主线可进入下一阶段

但软件侧现有 `/api/v1/system/status` 和 `/ops/system-monitor` 仍只展示 PostgreSQL / ClickHouse / Kafka / EMQX 这类中心组件摘要，无法直接反映：

- RK3568 当前网络模式是否正常
- southbound serial / northbound publish 是否在线
- node A / B / C 是否在线
- parser noise / publish pressure 是否处于可接受范围
- 当前现场主线是否仍处于已放行 soak 边界

这会导致软件端与现场 authority 脱节，运维同学仍需要回到 SSH、脚本输出或月记去判断边缘侧状态。

## What Changes

- 在现有 `/api/v1/system/status` 健康摘要模型上，新增一个只读、可选的 `fieldEdge` 扩展区块
- `fieldEdge` 只消费现有稳定证据源：
  - `field-rk3568-field-link-monitor-latest.json`
  - `field-rk3568-gateway-runtime-latest.json`
  - `field-rk3568-center-soak-latest.json`
- 扩展 `/ops/system-monitor`，在不改变现有中心组件摘要的前提下展示 RK3568 边缘运行态
- 明确软件侧只做“读取和展示”：
  - 不从 API 请求路径直接 SSH 板子
  - 不新增控制命令
  - 不改变现有 MQTT / telemetry / command contract

## Impact

- Affected specs:
  - `system-monitoring-api`
  - `ops-system-monitoring`
- Related changes:
  - `add-system-resources-interface`
  - `add-rk3568-edge-network-bootstrap`
- Affected code:
  - `services/api/src/routes/system.ts`
  - `apps/web/lib/api/dashboard.ts`
  - `apps/web/app/ops/system-monitor/page.tsx`

## Non-Goals

- 本变更不把 `/api/v1/system/status` 改成 CPU / 内存 / 磁盘资源接口
- 本变更不修改 `apps/desk` 当前历史兼容映射
- 本变更不增加新的边缘 MQTT topic、数据库表或写路径
- 本变更不在请求路径内发起 SSH、串口或板端 shell 操作
- 本变更不改变 RK2206 固件、中心 XL01 协议或 RK3568 southbound 主线
