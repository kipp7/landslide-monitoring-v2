---
title: proposal
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-edge-network-bootstrap/proposal
---

## Why

当前 `RK3568 -> center` 的正式上行、命令、readiness、handoff、routine guard 已经闭合，但现场板端仍缺少“开机后如何稳定进入可运维状态”的正式能力定义。

这会直接带来三个生产风险：

- 板子重启后是否能自动回到可联网、可 SSH、可上行的状态没有正式约束
- `STA first, AP fallback` 目前只存在于 authority 文档，还没有进入可执行的工程规范
- 网关主进程、网络管理、后续显示/UI/model sidecar 的启动边界还未冻结，容易在实现时互相抢资源

本变更的目标不是扩协议，也不是引入新的业务链路，而是把 `RK3568` 的联网与开机守护正式化，作为下一步落地实现的 authority baseline。

## What Changes

- 新增 `RK3568 edge network bootstrap` 能力规范
- 冻结 `STA first, AP fallback` 为正式开机联网策略
- 冻结固定维护热点名为 `rk3568-1`
- 定义网关主进程、网络/bootstrap 进程、sidecar 的启动顺序与隔离要求
- 定义网络失败时的回退行为、健康检查、恢复边界和 operator 证据要求
- 定义 RK3568 本地网络配置的持久化与最小变更路径
- 预留 `OpenClaw` 数据链质量监控 sidecar 的部署边界，但不在本轮实现模型能力
- 预留软件端 `RK3568` 群组状态监控的接入边界，但不在本轮扩展业务 UI
- 明确这条生产化线不改变现有 MQTT/topic/device contract

## Impact

- Affected specs:
  - `field-edge-runtime-operations`（新增）
- Affected docs:
  - `docs/guides/runbooks/single-host-runbook.md`
  - `docs/unified/reports/field-rk3568-edge-runtime-network-architecture-2026-04.md`
  - 后续将影响 RK3568 群组运行态/观测文档
- Affected code:
  - `services/field-gateway/deploy/*`
  - `scripts/dev/*rk3568*`

## Non-Goals

- 本变更不修改 `RK2206` 固件协议
- 本变更不改变 `telemetry/{device_id}`、`cmd/{device_id}`、`cmd_ack/{device_id}` 契约
- 本变更不引入显示屏或本地模型的业务实现
- 本变更不在本轮实现 `OpenClaw` 推理、告警决策或软件端群组大盘
- 本变更不确定最终现场路由器、天线、BOM 级选型
- 本变更不要求热点与 STA 同时长期并行承载业务流量
