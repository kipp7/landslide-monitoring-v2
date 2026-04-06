---
title: command-entry-stable-route
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/testing/command-entry-stable-route
---

# 正式命令入口稳定线路

目标：把当前已经验证通过的设备命令链，收成一条可以重复执行、可留证、可审计的正式线路。

## 1) 线路定义

正式命令入口只认这一条：

- `Desk / Web`
- `-> /api/v1/devices/{deviceId}/commands`
- `-> Kafka`
- `-> command-dispatcher`
- `-> MQTT`
- `-> relay`
- `-> COM5`
- `-> transparent XL01`
- `-> RK2206`
- `-> cmd_ack`
- `-> command-ack-receiver`
- `-> API command state / events / notifications`

当前冻结硬件基线：

- `COM5`
- transparent `USR`
- `ChunkStrategy=whole`
- `report_interval_s=5`

## 2) 为什么这是当前唯一推荐线路

- `Web` 与 `Desk` 现在都直接走 `/api/v1/devices/{deviceId}/commands`
- 真机 API live 闭环已经验证：
  - 命令状态 `acked`
  - 事件 `COMMAND_ACKED`
  - 通知已生成
- 所以下一步不应该再走临时旁路脚本做业务入口验证

## 3) 快速总检

从仓库根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-command-entry-stable-route.ps1
```

默认行为：

- 刷新 `Desk` 命令客户端契约 proof
- 刷新 `Web` 命令客户端契约 proof
- 读取最近一次真机 API live proof
- 汇总成统一报告

固定报告输出：

- `docs/unified/reports/command-entry-stable-route-summary-latest.json`

## 4) 需要真机重新跑一遍时

如果你希望在总检时顺带刷新一条新的真机命令闭环：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-command-entry-stable-route.ps1 -RunHardwareLive
```

默认真机动作：

- `manual-collect`

原因：

- 不破坏冻结基线
- 能直接验证：
  - API 状态
  - `COMMAND_ACKED`
  - 命令通知

如果你确实要改采样/上报周期，可显式指定：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-command-entry-stable-route.ps1 -RunHardwareLive -HardwareAction set-report-300
```

或恢复：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-command-entry-stable-route.ps1 -RunHardwareLive -HardwareAction set-report-5
```

## 5) 通过标准

统一总检报告里必须同时满足：

- `checks.deskClientContract.ok = true`
- `checks.webClientContract.ok = true`
- `checks.hardwareApiLive.ok = true`
- `allChecksOk = true`

目标结论字符串：

- `command-entry-stable-route-verified-across-desk-web-and-hardware-api-live`

## 6) 失败时先看哪里

统一总检如果失败，先看：

- `docs/unified/reports/command-entry-stable-route-summary-latest.json`
- `checks.hardwareApiLive.relayConclusion`
- `checks.hardwareApiLive.relayCaptureBytes`
- `checks.hardwareApiLive.relayCaptureLines`

如果这几个字段表现为：

- `commandStatus = sent`
- `relayPublishedCapturedAck = false`
- `relayCaptureBytes = 0`

优先判断为“本次 fresh hardware gate 没拿到 `COM5` 的现场回包”，而不是先回退去怀疑 `Desk` / `Web` 命令入口契约。

如果是某个子检查脚本自身失败，再看：

- `.tmp/check-command-entry-stable-route-*.stdout.log`
- `.tmp/check-command-entry-stable-route-*.stderr.log`

## 7) 什么时候不要再回到底层

如果上述总检已经通过，就不要再回去做：

- UART route 重新排查
- transparent 分段策略反复重试
- COM 端口重新猜测

除非现场硬件事实发生变化。
