---
title: proposal
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-central-polling-control/proposal
---

## Why

当前真实现场拓扑已经固定为：

- `RK2206 A/B/C -> center XL01 -> RK3568 /dev/ttyS3 -> platform`

三节点实测也已经证明：

- 单靠 `parser recovery` 不能把共享上行稳定性做成生产级
- 单靠 `5/7/11` 之类错峰不能稳定闭合 `A/B` 的 ACK / telemetry
- 中心 `XL01` 本身不是可编程调度器，无法承担全局仲裁

因此当前主线必须进一步明确为：

- 由 `RK3568` 持有共享南向链路的全局调度权
- 由边缘 `RK2206` 节点改为“本地缓存最新值 + 被轮询时回传”

## What Changes

- 新增 `field-central-polling-control` 能力规范
- 定义 `RK3568` 作为共享南向链路的唯一 polling/token owner
- 定义边缘节点 polling mode：
  - 本地持续采样
  - 共享链路不再自由周期直推
  - 仅在被轮询或人工触发时发送 telemetry
- 定义网关 poll session：
  - 发 poll command
  - 等 ACK
  - 继续等待目标节点 telemetry 或 timeout
  - 完成后才允许切换到下一节点
- 定义 operator command 与 polling 的仲裁规则：
  - operator command 高于内部 poll
  - 二者共享同一条 southbound control window

## Impact

- Affected specs:
  - `field-central-polling-control`（新增）
- Affected code:
  - `services/field-gateway/src/config.ts`
  - `services/field-gateway/src/index.ts`
  - `services/field-gateway/.env.example`
  - `services/field-gateway/deploy/field-gateway.env.rk3568.example`
  - `F:\2\openharmony\txsmartropenharmony\vendor\isoftstone\rk2206\samples\xl01_landslide_monitor_v1.0\config\app_config.h`
  - `F:\2\openharmony\txsmartropenharmony\vendor\isoftstone\rk2206\samples\xl01_landslide_monitor_v1.0\main\landslide_main.c`
- Affected docs:
  - `services/field-gateway/README.md`
  - `docs/unified/reports/field-rk3568-current-mainline-tasklist-2026-04.md`

## Non-Goals

- 本变更不改变北向 telemetry / command / command-ack 的现有平台合同
- 本变更不把中心 `XL01` 改造成新的可编程控制器
- 本变更不继续把节点固定错峰当成正式 closure
- 本变更不在本轮完成 node C 的硬件兼容性单独诊断
