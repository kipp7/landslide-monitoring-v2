---
title: proposal
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-shared-port-source-stream-control/proposal
---

## Why

当前 RK3568 现场网关已经证明：

- `lsmv2-field-gateway.service = active`
- `mqtt.connected = true`
- `serial.open = true`
- 命令可以转发到 `/dev/ttyS3`

但这并不等于共享串口已经达到生产稳定性。

最新正式证据已经收口为：

- `docs/unified/reports/field-rk3568-shared-port-interleaving-diagnosis-2026-04.md`
- `docs/unified/reports/field-rk3568-shared-port-stagger-experiment-latest.json`

它们共同说明：

- 当前主问题不是接收端 parser 还能不能再多补一点 heuristic
- 当前主问题是共享口上游没有把多节点数据流做成工业级的 source-side stream control
- `5/7/11` 这类错峰只属于试验项，不能作为正式 closure

如果不先把这条边界冻结下来，后续实现很容易继续在接收端做补丁式修复，拖慢主线并且掩盖真正的工程约束。

## What Changes

- 新增 `field-edge-stream-control` 能力规范
- 冻结共享南向串口的正式要求：
  - 单写者串行化
  - 完整帧原子写入
  - 命令后的 ACK 静默窗
  - 明确队列与超时边界
- 明确节点上报错峰只可作为辅助缓解，不得单独作为生产 closure 结论
- 明确共享口 readiness 必须使用：
  - `interleavingSuspected`
  - `interleavingWithMultipleSchemas`
  - `interleavingWithMultipleDeviceIds`
  - 节点在线状态
  作为正式验收证据
- 预留中心 XL01 与 RK3568 网关之间的 source-side control contract，但不在本提案中绑定具体固件实现细节

## Impact

- Affected specs:
  - `field-edge-stream-control`（新增）
- Affected docs:
  - `docs/unified/reports/field-rk3568-shared-port-interleaving-diagnosis-2026-04.md`
  - `docs/guides/testing/field-host-path-troubleshooting.md`
  - 后续将影响现场网关 runbook 和 southbound contract 文档
- Affected code:
  - `services/field-gateway/src/index.ts`
  - `scripts/dev/run-rk3568-field-gateway-node-command-proof.ps1`
  - `scripts/dev/run-rk3568-shared-port-stagger-experiment.ps1`
  - 后续将影响中心 XL01 / 边缘适配实现

## Non-Goals

- 本变更不继续扩展接收端 JSON 恢复 heuristic
- 本变更不改变北向 `telemetry/{device_id}`、`cmd/{device_id}`、`cmd_ack/{device_id}` 契约
- 本变更不在本轮定义中心 XL01 的最终固件代码实现
- 本变更不把错峰周期试验当作最终工程方案
- 本变更不引入新的平台业务页面或数据库结构
