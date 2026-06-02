---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-framed-field-link-transport/design
---

## Context

当前真实主线拓扑保持不变：

- `RK2206 field nodes A/B/C`
- `-> center XL01`
- `-> RK3568 /dev/ttyS3`
- `-> MQTT / API / Web`

本设计只升级 `center XL01 <-> RK3568` 邻接链路的 southbound transport，不改北向平台合同。

## Goals

- 为共享口提供稳定的帧边界
- 在链路层区分 telemetry / command / ack / control
- 为每帧提供完整性校验
- 为命令路径提供 stop-and-wait 闭环
- 把中心侧 telemetry 临时缓冲义务明确成契约

## Non-Goals

- 不把 RK3568 误写成直连三个分节点串口
- 不把中心侧源缓冲实现伪装成 RK3568 单侧补丁
- 不要求现网立即切换协议

## Decisions

### Decision: Introduce optional `cobs-crc-v1`

新增可选 southbound mode：

- `raw-json`
- `cobs-crc-v1`

其中 `cobs-crc-v1` 具备：

- COBS 帧边界
- header 中显式 `frame_type`
- `sequence`
- payload length
- CRC32

### Decision: Keep northbound contracts unchanged

framed link 只作用于共享南向 transport。

`telemetry/{device_id}`、`cmd/{device_id}`、`cmd_ack/{device_id}` 不改。

### Decision: Keep command closure as stop-and-wait

同一共享口上：

- 一次只允许一个 pending command
- 未完成 ACK closure 前不得继续占用命令窗口

### Decision: Source-adjacent buffering remains mandatory

中心侧必须具备：

- 在命令窗口内暂存 telemetry
- ACK 完成后再补发 telemetry

RK3568 可以增加观测与补充控制，但不能替代中心侧源缓冲。

## Risks / Trade-offs

- 只在 RK3568 引入 framed mode 而中心侧未配合时，不能产生闭环收益
- 双模式并存会增加部署配置复杂度
- CRC32 只能证明帧是否损坏，不能替代源侧调度

## Migration Plan

1. 先在 `field-gateway` 增加双模式支持，默认保持 `raw-json`
2. 保留现网主线运行
3. 后续在中心侧相邻控制点实现 `cobs-crc-v1`
4. 切换试验节点验证 framed mode
5. 通过后再扩大现场范围
