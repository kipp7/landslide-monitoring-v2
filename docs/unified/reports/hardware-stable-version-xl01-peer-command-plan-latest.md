---
title: hardware-stable-version-xl01-peer-command-plan-latest
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/hardware-stable-version-xl01-peer-command-plan-latest
---

# hardware-stable-version-xl01-peer-command-plan-latest

## 当前时间

- 2026-04-04

## 当前任务

- 把当前无传感器稳定运行的 RK2206 板卡，从“源码级命令 proof”推进到“真实 XL01 对端注入入口”这一层

## 本轮阅读了哪些文件

- `scripts/dev/inject-hardware-stable-version-command.ps1`
- `scripts/dev/start-hardware-stable-version-mqtt-uart-relay.ps1`
- `docs/unified/reports/hardware-stable-version-gateway-command-samples-latest.json`
- `docs/unified/reports/hardware-stable-version-gateway-uart-injection-readiness-latest.json`
- `../硬件稳定版/小凌派RK2206_v1.0_引脚配置.md`
- `../硬件稳定版/xl01_landslide_monitor_v1.0/当前配置总结.md`
- `../硬件稳定版/xl01_landslide_monitor_v1.0/接线检查清单.md`

## 本轮做了什么

- 重新核实了当前唯一正确拓扑：
  - `COM5` 是板子日志口，只读观察
  - `PB2/PB3` 是板载 XL01 业务 UART，不能改走别的用途
  - 真正的命令注入口应是“PC 侧第二个 XL01 模块所在的 USB-UART 口”
- 新增了两个明确面向“XL01 对端”的包装脚本：
  - `scripts/dev/send-hardware-stable-version-xl01-peer-command.ps1`
  - `scripts/dev/start-hardware-stable-version-xl01-peer-relay.ps1`
- 这两个脚本都带了同一条保护：
  - `PeerPort` 不能等于 `LogPort`
  - 默认 `LogPort=COM5`
  - 这样可以直接阻止把命令误打到板子日志口

## 当前结论

- 当前缺的不是再改板端引脚，也不是再碰 `COM5`
- 当前真正缺的是：
  - 给 PC 侧第二个 XL01 找到它自己的 `PeerPort`
  - 然后把已有样本或 MQTT relay 指向那个 `PeerPort`
- 现有链路已经足够支撑两种执行方式：
  - 单条样本直发：
    - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/send-hardware-stable-version-xl01-peer-command.ps1 -PeerPort <COMx> -LogPort COM5 -Sample manual_collect -ChunkStrategy whole -DryRun`
  - 真实 MQTT -> UART relay：
    - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/start-hardware-stable-version-xl01-peer-relay.ps1 -PeerPort <COMx> -LogPort COM5 -ChunkStrategy whole -DryRun`
- 推荐先用 `manual_collect` 做第一条实机对端注入：
  - 非破坏性
  - 命令效果在日志里相对容易观察
- 推荐第二条再用 mismatch 样本收“忽略守卫”证据：
  - `-Sample mismatch`

## 改了哪些文件

- `scripts/dev/send-hardware-stable-version-xl01-peer-command.ps1`
- `scripts/dev/start-hardware-stable-version-xl01-peer-relay.ps1`
- `docs/unified/reports/hardware-stable-version-xl01-peer-command-plan-latest.md`

## 是否有冲突或阻塞

- 没有新的源码冲突
- 当前阻塞只剩物理侧：
  - 还没有确认 PC 侧第二个 XL01 的串口号
  - 还没有做第一条真实空口注入

## 是否可进入 integration

- 可以
- 条件是先识别出 PC 侧对端 XL01 的 `PeerPort`

## 下一步建议

- 找出 PC 侧第二个 XL01 所在串口，例如 `COM8` 或 `COM9`
- 开一个窗口持续看板子日志：
  - `COM5 @ 115200`
- 先执行：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/send-hardware-stable-version-xl01-peer-command.ps1 -PeerPort <COMx> -LogPort COM5 -Sample manual_collect -ChunkStrategy whole`
- 如果这一步能在 `COM5` 日志里看到命令被板端消费，再切：
  - `scripts/dev/start-hardware-stable-version-xl01-peer-relay.ps1`
  - 把真实 MQTT `cmd/{device_id}` 命令也打进同一条空口路径
