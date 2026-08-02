---
title: rk2206-compact-v3-rtk-telemetry-contract
type: note
tags:
  - decision
  - rk2206
  - rk3568
  - gnss
  - rtk
  - telemetry
status: active
---

# Decision: RK2206 Compact V3 RTK Telemetry Contract

## Context

三节点当前稳定基线使用 46 字节 compact v2，但它只能携带普通经纬度，无法保留纳度坐标、高程、差分龄、解算龄、GST、基站号和 Fixed 连续性，因此不能支撑可审计的厘米级位移算法。与此同时，实际硬件没有使用 SHT30 和 MPU6050，继续采集或上传其字段只会增加 RK2206 资源占用、I2C 风险和服务端陈旧状态。

## Decision

- 常规上行改为单个固定 `compact v3` 快照：95 字节 payload，经过现有 field-link、CRC32 和 COBS 后为 113 字节整帧。
- 不再为 GNSS 发送第二个高频数据包；土壤、独立 RS485 三轴倾角、PC0 电池和专业 RTK 证据必须来自同一次节点快照。
- 活跃 RK2206 构建、采集结构和 v3 payload 删除 SHT30、MPU6050 加速度、角速度和姿态字段；RS-DIP-N01-1 的 `tilt_x/y/z` 必须保留，因为它是独立的工程倾角传感器。
- 坐标使用有符号 `1e-9 degree`，高程和 GST 使用毫米，时间和差分龄使用毫秒，避免 RK2206 浮点和 JSON 精度损失。
- 仅当当前 GGA 为 `4`、坐标与坐标系有效、差分龄不超过 5000 ms、解算龄不超过 2000 ms 时标记 `trusted`。RK3568 必须重复验证，不能只相信节点标志。
- v3 是完整快照替换，当前帧缺失的旧 MPU/SHT/GPS/RTK 字段必须从 `device_state` 清除；v1/v2 为兼容回滚继续稀疏合并。
- 模拟传感器固件保留真实 UM220、XLS1 和 PC0，只模拟 RS485 土壤/EC/倾角，并且不编译、不初始化 SC16IS752，PB4/PB5 保持未调用。硬件模式只能通过显式构建参数恢复。
- RTCM 注入继续为 disabled；compact v3 上行完成不代表 RTCM LIVE 已通过。

## Rationale

- 113 字节整帧在 115200 8N1 下约占 9.8 ms；即使三节点各 1 Hz，约 339 B/s，不值得通过删除 RTK 质量证据换取几十字节。
- 经纬度本身不能证明厘米级。GGA quality、差分龄、解算龄、HDOP/GST、Fixed 持续时间/比例/失锁次数和基站号用于拒绝坏历元、解释算法置信度并回答专家审查。
- 固定单帧避免 RK3568 跨包拼接不同采样时刻，也减少共享 XLS1 链路上的命令、ACK 和多包调度复杂度。
- 把 ECEF/ENU、Hampel/Kalman 和位移基线统一放在 RK3568，可避免 RK2206 资源超载及双套算法结果不一致。

## Consequences

- 字段名称看起来增加，但线上载荷仍是单个 95 字节定长快照；主界面只显示核心指标，完整质量证据留在后台和工程诊断。
- 现有 46 字节固件仍可回滚，网关和服务器必须同时支持 v1/v2/v3。
- 真机烧录后必须重新执行 60/600/1800 秒三节点门禁；构建和主机测试不能替代 XLS1 空口证据。
- RS485 元件到位后必须重建 hardware 包，先过断电电气检查和 `0x4D` 识别，再验收真实传感器；不得直接把 simulated 包改名使用。

## Follow-up

- 权威字节表和可信门禁见 `docs/field-tests/rk2206-compact-v3-rtk-telemetry.md`。
- compact v3 三节点门禁通过后，再接入专业 ECEF/ENU 位移算法；RTCM LIVE 仍按独立混合负载计划推进。
