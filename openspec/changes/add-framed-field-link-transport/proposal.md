---
title: proposal
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-framed-field-link-transport/proposal
---

## Why

当前共享南向口已经证明：单纯依赖 `NDJSON + parser recovery` 无法在高频场景下稳定保障 `command/ack` 闭环。

现网证据已经明确表明：

- `ACK` 会在共享字节流中被 telemetry 挤坏
- 仅靠 RK3568 读侧 heuristic 无法形成工业级 closure
- 必须把共享链路升级为显式 framed transport，而不是继续把“逻辑上一条 JSON”当作链路层完整消息

## What Changes

- 新增 `field-link-framed-transport` 能力规范
- 定义可切换的 framed southbound transport：
  - 显式报文类型
  - 链路序号
  - CRC 校验
  - stop-and-wait 命令闭环
- 定义中心侧在命令窗口内对 telemetry 的本地缓冲义务
- 在 `services/field-gateway` 引入可选 `cobs-crc-v1` 协议模式，作为 RK3568 主线落点

## Impact

- Affected specs:
  - `field-link-framed-transport`（新增）
- Affected code:
  - `services/field-gateway/src/config.ts`
  - `services/field-gateway/src/index.ts`
  - `services/field-gateway/src/field-link.ts`
  - `services/field-gateway/.env.example`
  - `services/field-gateway/deploy/field-gateway.env.rk3568.example`
- Affected docs:
  - `services/field-gateway/README.md`
  - 后续将影响中心 XL01 / 相邻源侧控制实现

## Non-Goals

- 本变更不改变北向 MQTT topic / payload 合同
- 本变更不把中心侧缓冲逻辑伪装成 RK3568 单侧即可完成
- 本变更不要求当前现场立即切换到 framed mode 才能继续运行
