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

## Compact V6 Core-Tilt Timing Amendment (2026-08-06)

- 复审确认 Compact V6 的三类 46 B payload 已占满固定线框的有效布局；保留坐标、
  GGA/差分龄/解算龄、HDOP/GST、Fixed 连续性、参考站和 RTCM 审计字段。删除这些
  字段不会缩短 64 B COBS/CRC 线框，反而会降低专家可审计性。
- 倾角属于 1 秒核心路径，改用独立 `300 ms` 响应超时和最多 1 次重试；包含 `80 ms`
  重试间隔的最坏等待约 `680 ms`。环境土壤/EC 仍为 `300 ms/0 retry`，原有 800 ms
  仅保留给非核心雨量等路径。这样单次倾角无响应不会拖过下一个核心采样槽，同时保留
  一次瞬态恢复机会。
- 源码标识升为 `v1.9-um220-rs485-rtk-compact-v6-lowrate-v2` /
  `fw-rk2206-rtk-compact-v6-lowrate-v2-live-20260806`；现场必须按新 marker 验证，不能
  混用 v1/v2 镜像。
- 该决定已由 clean commit `9b9be527a594085283747099c88812080f8f2b8a` 生成 A/B/C 发布包，
  manifest SHA-256 为 `9310ed3eb0bcf193a308e4d71b832b1f692af2d94eff318246e3a6ef9700704b`，
  路径为 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_lowrate_v2_corefast_rs485_gnss_hardware_live_20260806`。

## Compact V6 Acquisition Cadence Amendment (2026-08-06)

- 高频合同只包含长期位移需要的核心变化量：RS485 三轴倾角与最新 GNSS 解算按 1 秒
  生成原子快照。土壤温度、含水率、EC 和电池属于慢变量/健康量，统一 10 秒采集。
- 同步 RS485 总线必须先执行倾角；低频路径只能使用 300 ms 超时且不重试。其失败只
  清除对应有效位，不能发布 0、不能回滚到更旧 epoch，也不能触发面向 core 的全总线
  恢复动作。
- 电池电压/电量、坐标/GGA/差分龄/解算龄/HDOP/GST、GNSS 周时、参考站、Fixed 连续性
  和 RTCM 审计全部保留。它们分别提供电源、坐标、精度、时间和差分链证据；Compact V6
  是固定 46 B payload，删除这些字段不会缩短 64 B 完整线框。
- P3/P4 同时到期时都必须进入有界队列；2 秒 core 截止优先于扩展和 RTCM。该规则以
  core 不被低频诊断或慢传感器饿死为最高优先级。
- 生产容错与硬件验收分开：运行中允许单次土壤/EC 缺失，但每节点正式验收仍须证明
  电池和三合一探头至少成功读取一次，防止长期断线被误判为通过。

## Trusted Correction-Age Amendment (2026-08-06)

- 山体滑坡长期静态监测的正式高可信门限调整为：当前 checksum-valid
  `GGA=4`、坐标与坐标系有效、差分龄 `<=6000 ms`、解算龄 `<=2000 ms`。
- RK2206 负责产生 `trusted`，RK3568 必须用相同门限二次校验；`6000 ms`
  包含在高可信范围内，`6001 ms` 起拒绝参与位移基准更新和预警。
- 本调整不改变历史现场报告采用的旧门限和实测统计，也不允许仅凭 `GGA=4`
  绕过差分龄、解算龄及坐标系门禁。

## Compact V6 Protected Single-P1 Decision (2026-08-04)

### Evidence

- Hybrid 600 秒发送 113 次 P2，只有 `472/473` 完整轮，出现 4 个解码错误和大量
  冗余响应。修正恢复记账后的 120 秒虽为 `93/93`，但 20 次 P2 无一次抢在原 P1
  前完成，反而增加 17 个 recovery-redundant 和 3 个 duplicate，故 P2 对当前
  XLS1 队列没有恢复收益。
- protected-P1 新固件烧录后，两次正式 60 秒均为 `51/51` 完整 core round，
  所有协议/线框/scope/epoch/序号错误为 0；修正版一轮 A/B/C arrival P95 为
  `1521.3/1375.4/1397.7 ms`，command P95 为 `517.7/786.2/1048.5 ms`，证明
  单个 64 B P1 分层线框在当前三节点短门禁同时满足速度和稳定性。

### Decision

- 生产高频 core 只发送一个 P1，关闭 P2：
  `SOUTHBOUND_POLLING_PARTIAL_RETRIES=0`。RK2206 保存最近 256 个 P1 command tag，
  约使用 2.5 KiB 静态内存；RK3568 最多保护 6500 ms，A/B/C 齐全立即结束，轮后
  静默 250 ms。迟到 unmatched、duplicate 和 recovery-redundant 只进入本地计数，
  不刷新节点状态、不发布 MQTT。
- P3/P4 生产 cadence 保持每 30/60 个完整 core round。验收器的每个独立阶段在
  有效 core 快照后额外做一次 P3 和一次 P4 能力探测，避免 60 秒阶段因实际轮次
  少于 60 而机械误判；探测仍执行相同 wire、scope、epoch、profile 与 RTCM
  fail-closed 门禁，不降低任何生产标准。
- 正式性能边界为 per-node core arrival P95 `<=2500 ms`、command P95
  `<=2500 ms`、command max `<=6500 ms`。旧 `1500 ms max` 已被现场传播尾延迟
  反复证明不现实，不能继续拿它制造假失败；6500 ms 只允许异常尾部，不能放宽
  P95 更新速度。

### Current Boundary

实现与最终 A/B/C 包绑定提交 `4ea5b7ea4df98828309983a60caf988578d540c8`；
验收器能力探测修复提交 `2f1a2614`。此前短门禁的唯一阻断是 C environment 的
PC0 电池字段持续无效，土壤/EC、倾角和通信均正常；当时保持 fail-fast，未删除
电池门禁或沿用陈旧电压。该阻断已由下述重新插稳和完整门禁闭环。

### Validation Result

C 重新插稳后 PC0 字段恢复，protected single-P1 已按正式 cadence 完成独立
60/600/1800 秒门禁：`46/46`、`508/508`、`1419/1419` 完整 core round，所有
协议、线框、scope、epoch、profile 和序号错误为 0。1800 秒三节点 arrival P95
均小于 2.1 秒，command P95 均小于 1.4 秒；P3 `25/25`、P4 `24/24`。因此本决策
作为“真实 RS485/电池、模拟 GNSS、RTCM disabled”的室内生产传输基线正式接受，
hybrid/P2 与旧大帧路线继续冻结。该结论不跨越 GNSS 真值边界：硬件 GNSS、CORS、
RTCM LIVE、GGA=4 和厘米级 ENU 位移仍需独立室外发布包与门禁。

## Compact V6 Hybrid Recovery Refinement (2026-08-04)

### Evidence

- 原 V6 P1 分层方案 60 秒为 `57/57` 完整 core round、零错误，但 600 秒仅
  `438/453` 完整，出现 4 个解码错误和 9 个同 tag 重复帧；两组坏帧均精确为
  `79+49=128 B`，即两个 64 B 帧交织。报告 SHA-256 为
  `34899b6d7a23845a5c6fb433cc43385f1ec7eb3babd17cffe7895e37083acf38`。
- P2 定向串行把 1 ms 冷却短测做到 `168/168`、零通信错误，刷新 P95
  `1358.2/1383.3/1410.2 ms`；但完整分层 600 秒为 `1010/1011` core 帧，三节点
  arrival P95 已升至 `3392.2/3390.8/3278.4 ms`，严格速度失败。报告 SHA-256
  `1ce6884a40978fa4a23cbdad7674745b83e6c02cf94e6f653c2c478f5b59f7b2`。

### Decision

- 高频 core 改为混合闭环：正常轮只发一个 P1；RK2206 在进入 `0/340/680 ms`
  响应时隙前抑制最近 8 个 P1 的重复投递；初始窗口缺节点时，RK3568 不重发 P1，
  而是逐节点发送带新 tag 的 P2，收到或超时后才处理下一个缺失节点。
- P3 environment 从每 3 个完整 core round 调整为每 30 个，P4 audit 从每 15 个
  调整为每 60 个。90 秒实测的低频对照为 `61/61` 完整 core round，P3/P4 均匹配，
  arrival P95 `2108.4/2303.0/2341.0 ms`，报告 SHA-256
  `9aa158fc5bc3ebbe2514ef1077bd3afae90be7a3463496793522556e318509ee`。
- 性能门槛不降低：per-node core arrival P95 仍 `<=2500 ms`，产生有效 core 的命令
  最大响应仍 `<=1500 ms`。恢复总保护窗只约束异常轮，不用于放宽健康轮速度。

### Boundary

该混合方案已由 clean/pushed 提交
`c78ad6f3779499ab1ddf5f6d1e3055e13908c1ed` 构建。唯一下一轮正式包为
`F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_hybrid_rs485_gnss_simulated_20260804`，
manifest SHA-256 `38f9b8c4aea295f700d5cff9dd28492212a8dba14f02bb6ec4e551fba09d25e5`。
尚未烧录或完成 `60/600/1800` 真机验收；旧 V6 layered-v1 镜像继续保留为失败
证据，不再作为下一轮烧录包。

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
- V6 实现已由 clean 提交 `af0c6e519ef8294fdda74ff5f1e79b280cd4ef05`
  完成 A/B/C 全量构建、全部离线门禁和 clean release。正式室内包位于
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_layered_rs485_gnss_simulated_20260804`，
  manifest SHA-256 为 `ff5191ba5d3908ea38c6cc4d24a90013707b0d15fa5a13bac98d8615bc1f3039`。
  这仍不是 V6 真机结论；必须按标签统一烧录并重新执行严格 `60/600/1800` 秒，
  通过前 NTRIP/RTCM/CORS 保持关闭。
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
- 仅当当前 GGA 为 `4`、坐标与坐标系有效、差分龄不超过 6000 ms、解算龄不超过 2000 ms 时标记 `trusted`。RK3568 必须重复验证，不能只相信节点标志。
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
