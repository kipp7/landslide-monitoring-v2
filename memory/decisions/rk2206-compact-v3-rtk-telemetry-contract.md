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

## Compact V6 Layered Amendment (2026-08-04)

### Context

Compact V5 在 600 秒真实三节点链路中只有使用 6 秒保护窗才做到无损，且
command P95 和 per-node arrival P95 均超过既定 `1500/2500 ms` 门限。XLS1
手册的标称会话 payload 上限为 64 B，因此 128 B 完整 V5 线框仍需至少两个
空口包，不能同时满足速度和稳定性。

### Decision

- 采用 `compact-layered-v1`：core/environment/audit payload 均固定 46 B，完整
  COBS/CRC 线框固定 64 B。P1 广播 core，A/B/C 时隙为 `0/340/680 ms`；每 3
  个完整 core round 插入一个定向 P3 environment，每 15 个插入一个定向 P4
  audit，冲突时 audit 优先，扩展目标轮转 A/B/C。
- core 保留高频三轴倾角与可信位移必要证据；environment 保留真实三合一土壤、
  校准电池和低频 GNSS 辅助量；audit 保留 Fixed 连续性、参考站、GST 和 RTCM
  会话/租约/队列/错误摘要。SHT30、MPU6050 和雨量仍不加入。
- RK2206 为 core 保存互斥保护的原子传感器快照；P3/P4 复用该快照及同一个非零
  `sample_epoch`，但使用各自递增且跳过 0 的 `seq`。启动后没有 core 快照时
  扩展 fail closed。
- RK3568 只接受与活动窗口一致的 scope；错 scope 帧进入本地 rejected evidence，
  不关闭正确窗口也不上云。串口 error/close 清除待发扩展、活动轮询和普通命令窗，
  重连后从新 core 开始。
- 服务端只合并与当前 core 相同 epoch 的扩展。V6 重启只在 core、seq 严格回退、
  epoch 回退或相等、receive time 更新四条件同时成立时接受，并清空旧 scopes。
  ClickHouse 隔离回退只用实际插入成功的消息重放 shadow，DLQ 消息不得污染状态。

### Consequences

- 高频线框首次落入一个 XLS1 标称 64 B 空口包，同时不删除专业字段；代价是土壤、
  电池和完整审计改为低频，但仍按源 core epoch 可追溯。
- `1500 ms` command maximum 和 `2500 ms` per-node core arrival P95 不降低。
- 当前 V6 仍是 dirty-source 离线候选，没有正式发布包，也没有真机结论。必须完成
  同一提交的 A/B/C clean build、全部离线门禁、clean release，再重新执行严格
  `60/600/1800` 秒；通过前 NTRIP/RTCM/CORS 保持关闭。
- 权威验收规则见 `docs/field-tests/rk2206-compact-v6-layered-acceptance.md`。

## Compact V5 Amendment (2026-08-04)

### Context

Compact V4 在真实三节点共享 XLS1 的 600 秒门禁中只有 `793/813` 匹配，
并形成 10 组 `236 B + 78 B = 314 B` 的双 157 B 帧交织。3000 ms 保护窗
能阻止帧交织，却仍无法满足 command latency `<=1500 ms` 和 per-node arrival
P95 `<=2500 ms`。DL-XLxx 手册规定会话层标称 payload 为 `[0,64] B`，V4
完整帧至少需要三个标称空口包，因此不能再靠增大超时解决。

### Decision

- 新周期协议使用 Compact V5：完整保留 V3 的 95 B 专业传感器与 RTK 前缀，
  RTCM 扩展压缩为 15 B，总 payload `110 B`，完整 COBS/CRC 帧固定 `128 B`。
- 周期 RTCM 摘要只保留 mode/state、pending/high-water、session epoch、100 ms
  分辨率租约、10 ms 分辨率最近完整帧年龄、饱和 16 位 injected count 和错误位。
- rejected/CRC/queue/UART 错误位只表达“本次启动曾发生”，不得伪装成精确累计数；
  完整累计明细继续由单节点按需 G3S V5 提供，禁止周期或并发查询。
- RK3568 继续重复验证 fail-closed、保留位、会话/租约和计数饱和关系；服务器把
  V5 作为完整快照替换，Windows 显示“正常/异常位摘要”。
- 100% 匹配、零协议/profile 错误、1500 ms command latency 和 2500 ms
  per-node arrival P95 门禁不降低。3000 ms 只作为防止迟到帧交织的保护窗。

### Rationale And Consequences

128 B 完整帧最多占两个标称 64 B 空口包，直接减少已实测的第三包尾延迟，且没有
删除土壤温湿度/EC、三轴倾角、电池、纳度坐标、高程、GGA/HDOP/GST、差分龄、
GNSS 周时、Fixed 连续性和参考站等专业字段。代价是周期帧不再携带所有 RTCM
累计计数，但这些数据仍可按需审计。V5 当前仅完成离线跨端验证，必须重新通过
真实 A/B/C 的 60/600/1800 秒门禁后才能视为稳定传输基线。

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
