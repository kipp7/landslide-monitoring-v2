---
title: gnss-rtk-fixed-validation-and-deployment
type: note
tags:
  - task
  - gnss
  - rtk
  - rk3568
  - rk2206
status: active
---

# Task: gnss-rtk-fixed-validation-and-deployment

## Goal

将已验证可 Fixed 的 3 套 UM220-IV NK + BT-760 部署为可追溯、资源可控的三节点 RTK 位移系统；先通过共享链路门禁，再实现 RK3568 专业位移算法、服务器长周期分析和现场诊断。

## Current State

### G3B v1 Clean Release Verified; 0.5 Hz Still Fails Age Gate (2026-08-05)

- 天线调整后的双观测组 `0.5 Hz` LIVE 连续 `300 s`：最后 `120 s` A/B 持续
  `GGA=4`，C 全程 `GGA=5`；A/B/C 接收修正片段约 `1514/1515/1533`，网关 CRC、
  UART 写、普通轮询、schema 和交织错误均为 0。C 没有少收修正，需按节点独立处理
  天线摆放、多路径、接收机状态或收敛问题。
- correction-age P95 仍约为 A/B/C `10/9/7 s`，未达到 `P95 <=3 s`、`max <=5 s`，
  所以 0.5 Hz 不能晋级生产，专业位移和厘米级展示门禁继续关闭。
- 已实现 `G3B v1`：单个 field-link/XLS1 帧聚合 `2..4` 个旧 G3R，RK2206 对整个
  批次和每个内层片段先验校验，写失败保持原顺序回队；双方共同强制 `1024 B` 上限。
  burst 预算按外层帧计，健康状态分开记录外层写入和内层片段写入。
- 向后兼容默认值为 `RTCM_MAX_FRAGMENTS_PER_FIELD_FRAME=1`。三节点全部烧录新镜像前
  禁止设为 2；烧录后也必须先过聚合数 1 的 legacy G3R PROBE，再过聚合数 2 的
  G3B PROBE，才允许受控 1 Hz LIVE。
- 实现与记录已由 clean 提交
  `d4a7155547d3d7dc6e84d36b3fbc6d9fed170030` 推送；field-gateway `71/71`、
  TypeScript build、ESLint、RK2206 C99 与关键安全门禁全部通过，敏感扫描为 0 命中。
- 正式 A/B/C 包位于
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_rtcm_batch_v1_rs485_gnss_hardware_live_20260805`。
  manifest SHA-256 为
  `11afc1f4c835c9267afc8cb3753d881a050baa69700a3b9683f61cf2dd494a6f`；A/B/C
  `.img` SHA-256 分别为
  `450a8d3a62714fae6f771729fcf6745d077ac4e83f1653594b81584167ed958a`、
  `3d42289066e70eda27c212093fc83c2cc3de499c1008f41c3580523f81598fd8`、
  `5405d02c463333d8779c223e04dcd63a7935274826badd23d6e48d56035abfc1`。
  独立发布验证确认 clean source、唯一身份、真实 GNSS/RS485、最终 PC0 校准、LIVE
  capability/boot DISABLED、Compact V6 layered 与 7 个清单文件全部通过。

### Three-Node LIVE Reached RTK FIXED; Displacement Gate Still Closed (2026-08-05)

- A/B/C 已烧录 UART drain V2 LIVE 候选。三节点 UM220 UART 均按 `115200` 工作；
  A 的最终 G3S V6 诊断确认 `read_errors=0`、`fifo_drop=0`，GNSS、真实土壤三合一
  与倾角当前有效。B/C 最终 G3S V6 快照因现场收设备尚待补测。
- RK3568 已采用受轮询保护的 RTCM 调度：节点 LIVE 证据有效窗 `45 s`，连续下发
  最多 `4` 帧，随后至少给普通轮询 `600 ms` 保护。真实 CORS LIVE 约 7 分钟得到
  `111/111` 完整普通轮询、零 poll timeout、348 帧 RTCM 下发、caster 2112 个
  有效帧且 CRC 0，三节点授权持续 `3/3`。
- A/B/C 最终都报告 `quality=4 / RTK FIXED`，卫星数约 `32/32/34`，HDOP 约
  `0.55`。这证明三节点共享链路和硬件可以同时进入 FIXED；但 correction age 约
  `10 s`，且 `rtk_trusted=false`、`rtk_displacement_eligible=false`，所以专业
  厘米级位移门禁仍关闭，尚未建立 ECEF/ENU 基线。
- `1000 ms` 轮询、`6 frames/250 ms`、`4 frames/250 ms`、`4 frames/1200 ms`
  均因授权下降、轮询超时或后半段 FLOAT 被拒绝。当前唯一保留候选是
  `512 B fragment / 4 frames / 600 ms guard / 45 s evidence`；详细证据见
  `docs/field-tests/gnss-rtk-three-node-live-acceptance-20260805.md`。
- UART drain、G3S V6、RTCM burst/poll 仲裁与测试已由提交 `bd356416` 推送；现场
  文档和本任务/检查点更新已由提交 `7f8234f2` 推送。现场候选镜像尚需从 clean
  implementation commit 重建、复算并重做必要门禁后，才能升级为正式发布包。
- 用户已在降雨风险前收回 A/B/C。RK3568 保持 `NTRIP_ENABLED=false`、runtime
  `probe`、fragment `512 B`、poll `250 ms`、audit cadence `2`，服务 active、
  `NRestarts=0`，受保护环境文件仍为 `root:root 0600`。

### Hardware-GNSS V6 Release Ready; CORS Staged Fail-Closed (2026-08-04)

- 从干净提交 `eb76454b2bb15204e24934d8fc387128cb3f1c19` 生成正式硬件 GNSS
  发布包 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_protected_p1_rs485_gnss_hardware_live_20260804`。
  包保持受保护单 P1 的 `46 B payload / 64 B wire`，使用 PB6/PB7 上真实
  UM220-IV NK、PB4/PB5 上真实 RS485 和最终逐节点 PC0 校准。固件编译具备 LIVE
  能力，但每次上电均为 `boot=DISABLED`，只有新鲜的有限租约才能依次进入
  PROBE/LIVE，租约过期或重启自动关闭。
- manifest SHA-256 为
  `19cb4cc34c9b3b089fb1b0ba0b7f70843917ef78702ac73d52adda63d70691cc`；A/B/C
  `.img` SHA-256 分别为
  `56dc3e25cf5ba36dc8f4969d6cca959912baca5cf046a435aae13780aa165e08`、
  `1e99db87854c68156b848ce66bbd81b20c0467ef2a2ad0fce0fd8e02d47fc7a9`、
  `b24370a2ddb07d013165466a855b276f60f6de7de848bd764da34caced455126`。
  独立复核确认 manifest 7/7 文件长度与哈希匹配，三个镜像只包含自身 UUID/标签，
  均包含硬件 GNSS、UART 初始化、protected-P1 和 `boot=DISABLED capability=LIVE`
  标记，不含 simulated、PROBE-only 或 DISABLED-only 标记。
- RK3568 已把本次短期 CORS 参数原子写入 `/etc/lsmv2/field-gateway.env`，原文件备份
  为 `/opt/lsmv2/backups/ntrip-preconfigure-20260804-202843/field-gateway.env`。配置文件
  保持 `0600 root:root`，网关重启后 `active/running`、`NRestarts=0`，健康状态仍为
  `NTRIP_ENABLED=false`。另已显式固定 `RTCM_RUNTIME_MODE=probe`、三节点 mask、90 秒
  租约和 `160 B/160 ms` 边界，安全配置前备份为
  `/opt/lsmv2/backups/ntrip-probe-safety-20260804-203816/field-gateway.env`；后续启用
  NTRIP 也不会因程序默认值直接进入 LIVE。账号、密码、端点、坐标和原始 RTCM
  不进入 Git、memory 或普通日志。
- 当前等待用户按物理标签烧录 A/B/C。厘米级尚未验收；烧录后必须先在室外、CORS
  关闭状态完成真实 GNSS 纯遥测 60/600 秒，再运行统一有限 PROBE，只有节点端 CRC、
  分片、队列和零 UART 注入证据全部通过才切 LIVE，最终以持续 `GGA=4`、差分龄
  `<=5 s`、可信 GST 和 1800 秒三节点混合负载验收。

### Protected-P1 Indoor 60/600/1800 Gate Complete (2026-08-04)

- C 重新插稳后电池有效位恢复。20 秒高频 environment 复核覆盖 C 两次，profile
  violation 从此前 12 个降为 0；正式 60 秒随后 `46/46` 且 `stableProfile=true`。
- 正式 600 秒为 `508/508`，1800 秒为 `1419/1419`；两段均为零丢帧、解码、
  交织、重复、未匹配、scope/epoch/profile/sequence 错误且 P2 为 0。1800 秒
  A/B/C arrival P95 `2095.0/1868.7/1810.2 ms`，command P95
  `1063.4/1387.7/1051.5 ms`，最大 `3454.7/3157.9/1479.2 ms`，严格满足门槛。
- 1800 秒内 P3 environment `25/25`、P4 audit `24/24`，A/B/C 均获得覆盖；真实
  soil temperature/moisture/EC、三轴倾角和 field-calibrated PC0 全程有效，模拟
  GNSS 保持 untrusted/displacement-ineligible，RTCM 保持 disabled/READY-only 且
  活动和错误计数为 0。
- 现场原始报告仅留 RK3568；三阶段报告及 summary 的 SHA-256 已记录在 checkpoint。
  验收后 field-gateway active、零重启、hold clear、NTRIP false。室内传输任务完成；
  下一任务是生成独立 hardware-GNSS V6 clean release，并在室外依次执行纯硬件
  GNSS 遥测、RTCM PROBE、RTCM LIVE、持续 GGA=4/可信 ENU 位移门禁。

### Protected-P1 Deployed; C PC0 Blocks Long Gate (2026-08-04)

- Hybrid 的 P2 恢复没有带来更早响应：修正记账后的 120 秒中 20 次 P2 全部晚于
  原 P1，并产生 17 个冗余帧和 3 个真重复帧。正式实现已在 `4ea5b7ea` 收敛为
  单 P1、256 条节点去重、6500 ms 异常保护、三节点齐全早关和 250 ms 轮后静默；
  生产 `SOUTHBOUND_POLLING_PARTIAL_RETRIES=0`，性能门槛为 arrival/command P95
  `<=2500 ms`、command max `<=6500 ms`，不再重复 hybrid/P2 参数试验。
- 用户已烧录并上电 protected-P1 A/B/C 正式包；包目录、manifest 与三个镜像完整
  哈希记录在 checkpoint。RK3568 保持 NTRIP/RTCM disabled，服务 active、零重启，
  生产被动观察已确认 A/B/C 持续发布且无调度/协议错误。
- 首轮 60 秒的 `51/51`、零错误结果因验收器要求自然到第 60 轮才产生 P4 而被误判；
  `2f1a2614` 已让每个阶段先各验证一次 P3/P4 能力，再使用生产 30/60 cadence，
  本地和 RK3568 金向量、Python 编译、dry-run 均通过，板端回滚目录为
  `/opt/lsmv2/backups/compact-v6-acceptance-probe-predeploy-20260804-175839`。
- 修正版 60 秒通信层再次 `51/51` 且零 decode、wire、unmatched、duplicate、scope、
  epoch、sequence 和延迟错误；30 秒高频 P3 诊断又为 `23/23`。两轮只在 C
  environment 复现电池无效，3 次均为 `validFlags=14`、`battery_v=null`、
  `battery_pct=null`，同时 C 的 soil temperature/moisture/EC 与 core tilt 正常；
  A/B environment 全有效。因此这不是链路、XLS1 吞吐、SC16IS752 或三合一探头
  故障，而是 C 的 PC0/SARADC 独立路径。
- 当前 fail-fast 停止在 60 秒，不运行 600/1800。用户下一次只需在 C 完整上电时
  测 `PC0-GND`：约 `2.44 V` 表示载板分压基本到位，应查 C 核心板 PC0/SARADC
  与插接；接近 0 V 或 3.3 V 则查 100k/27k 分压、焊点和走线。修复并确认 C
  environment 电池有效后，从正式 60 秒重新开始，再自动进入 600/1800。

### Compact V6 Live Rejection And Hybrid Recovery Candidate (2026-08-04)

- 用户已烧录并上电原 clean V6 A/B/C。P1 分层 60 秒 `57/57` 完整、零错误；
  600 秒为 `438/453` 完整，4 个解码错误、9 个重复响应，坏帧证明两个 64 B 帧
  发生交织。P2 定向 1 ms 冷却短测 `168/168` 且刷新 P95 约 `1.36..1.41 s`；
  但完整分层 P2 600 秒三节点刷新 P95 `3.28..3.39 s`，因此广播缺长期去重、
  纯串行又不满足速度，两条单一路径均停止。
- 90 秒低频 P3/P4 对照 `61/61` 完整 core round、零协议/profile/epoch 错误，
  arrival P95 `2108.4/2303.0/2341.0 ms`；据此把 environment/audit 调整为
  `30/60` 个完整 core round，避免低频字段拖慢厘米级位移核心。
- 当前候选使用 P1 健康路径、RK2206 最近 8 个 P1 去重、RK3568 对缺失节点逐个
  P2 单飞恢复；不再重发同一 P1。离线 C99、Python、field-gateway `58/58`、lint、
  发布门禁均已通过。clean/pushed 提交 `c78ad6f3779499ab1ddf5f6d1e3055e13908c1ed`
  已生成唯一 A/B/C hybrid 包：
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_hybrid_rs485_gnss_simulated_20260804`。
  manifest SHA-256 为 `38f9b8c4aea295f700d5cff9dd28492212a8dba14f02bb6ec4e551fba09d25e5`；
  A/B/C `.img` SHA-256 为 `10385b69...d25c3`、`e331872a...104f5`、
  `3770876c...c0f4f1`。独立门禁确认 hardware RS485、simulated GNSS、RTCM
  disabled、final battery、46/64 B、dedup 8 和 P3/P4 `30/60`。
- RK3568 已部署同提交构建的向后兼容 `index.js`/`config.js` 和 hybrid 验收器，
  备份 `/opt/lsmv2/backups/compact-v6-hybrid-code-predeploy-20260804-162844`；三文件
  SHA-256 为 `f1ddd515...8d3c8`、`b7f90c04...37d6b`、`fbcaec3a...a371`，服务
  active、`NRestarts=0`。在用户重刷前环境故意保持 `1500/partial0/P3-3/P4-15`；
  旧节点日志中的 partial timeout 不是 hybrid 验收。下一步只需按标签重刷三份新
  `.img`，再原子切换 `6500/partial1/retry1500/P3-30/P4-60` 并跑 fail-fast。
- 真机报告分别保留在 RK3568：P1 60/600 SHA-256 为
  `cc69e8082bcf514cc24183cbece92064e7ec55fdadc34d61e24f45440e6dd020` /
  `34899b6d7a23845a5c6fb433cc43385f1ec7eb3babd17cffe7895e37083acf38`；
  P2 1 ms 60、低频分层 90、分层 600 SHA-256 为
  `d123ecb047b7e0ada1e2daa975b889f7cd3fd12743462a8e2608c17af5e6fc06`、
  `9aa158fc5bc3ebbe2514ef1077bd3afae90be7a3463496793522556e318509ee`、
  `1ce6884a40978fa4a23cbdad7674745b83e6c02cf94e6f653c2c478f5b59f7b2`。

### Compact V6 Layered Clean Release, Awaiting Field Gate (2026-08-04)

- 已实现一个标称 XLS1 单包的分层候选：core/environment/audit 均为 `46 B payload /
  64 B complete frame`。P1 广播 A/B/C core 并使用 `0/340/680 ms` 时隙；P3 每
  3 个完整 core round、P4 每 15 个且优先，定向目标轮转。
- 高频 core 保留三轴倾角、纳度坐标、高程、GGA/卫星/HDOP、correction/solution
  age 和水平 GST；低频 environment 保留校准电池、三合一土壤、geoid/GNSS time/
  垂直 GST；audit 保留 RTCM 运行摘要、Fixed 连续性、参考站和完整水平 GST。
  SHT30、MPU6050、雨量不重新加入。
- 节点扩展复用最近 core 的同一原子快照和 `sample_epoch`；服务器只展平相同 epoch，
  重启时清空旧 scopes。网关拒绝错误 scope 并在串口断开时清空所有相关窗口。
  最新复审又补上隔离 ClickHouse 失败消息不进入 shadow，以及三端拒绝 V6 `seq=0`。
- 最终离线回归已通过：RK2206 host/safety 和发布正反例、A/B/C `hb build -f`、
  field-gateway `58/58`、telemetry-writer `18/18`、API `10/10`、相关 lint/build、
  Windows WPF Release、Python/PowerShell/Bash 解析、金值、dry-run、补丁与敏感信息
  审计。API 全仓 lint 的 68 个既有错误不在 V6 改动文件内，保留为明确基线缺口。
- clean 实现提交 `af0c6e519ef8294fdda74ff5f1e79b280cd4ef05` 已推送。正式包位于
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_layered_rs485_gnss_simulated_20260804`，
  manifest SHA-256 为 `ff5191ba5d3908ea38c6cc4d24a90013707b0d15fa5a13bac98d8615bc1f3039`；
  A/B/C `.img` SHA-256 为 `3bda38a61...769c38`、`930903f03...10936f`、
  `138312e9...aa367`。包已证明构建和配置真值，尚未证明现场链路；下一步只烧录
  对应标签的三份正式 `.img`，从真实 RS485 + 模拟 GNSS + RTCM disabled 的
  `60/600/1800` 门禁开始。

### Compact V5 Live Gate: Integrity Passed, Cadence Rejected (2026-08-04)

- A/B/C 已统一烧录正式 V5，真实 RS485、校准电池、模拟 GNSS 和 RTCM disabled/clean 身份均正确。原正式 60 秒因排空只有 500 ms、保护只有 3000 ms，得到 `37/39`、2 个 decode error、1 个 unmatched；坏帧 `207+49=256 B` 精确证明两个 V5 128 B 帧交织，unmatched C 则证明生产残留未排空。
- 5 秒连续静默和 6000 ms 防碰撞窗的 60 秒对照为 `63/63`、零全部通信/profile 错误；command P95 满足 1500 ms，但 arrival P95 为 `3419.8/3400.0/3645.4 ms`，速度失败。600 秒为 `621/621`、207/207 完整批次、零通信/序号错误；仅 C 一帧 tilt invalid，command P95 `1836.4/2101.2/2093.9 ms`、arrival P95 `5377.9/5498.2/5757.7 ms`，因此停止且未进入 1800 秒。
- V5 已证明“充分保护时 600 秒不丢”，但没有证明目标刷新率或完整传感器 profile。当前 P2 三节点串行轮询是节奏瓶颈，不能继续靠调大 timeout。下一候选应把每个高频线框限制在一个 XLS1 `<=64 B` 标称会话包：高频位移/倾角核心与低频 soil/EC/battery/完整 GNSS/RTCM 审计扩展分层，保持同一采样 epoch 和 fail-closed 组装。
- 验收器修复 `ae2371b6` 与生产保护配置 `c4c9289b` 已推送。RK3568 已用 `/opt/lsmv2/backups/targeted-guard6s-predeploy-20260804-123356` 为回滚点切到 6000 ms；环境仍 `root:root 0600`、NTRIP false，生产 60 秒 `96/96`、A/B/C 各 32 帧，零超时/交织/拒绝/写入/发布错误，服务 active、`NRestarts=0`。

### Compact V5 Candidate And Powered V4 Baseline (2026-08-04)

- A/B/C 当前全部上电并持续返回 Compact V4。RK3568 服务 active、`NRestarts=0`、MQTT connected，NTRIP 关闭；60 秒生产窗口 `119/119` 匹配，A/B/C 为 `40/39/40`，零协议、交织、发布、写入、超时和重连增量。真实土壤/EC/倾角与校准电池有效，GNSS 仍是明确标记的室内模拟源。
- 该短测不覆盖已知 V4 600 秒 `793/813` 和 10 组 157 B 双帧交织失败。Compact V5 已把周期线框压到 `110 B payload / 128 B complete frame`，保留全部 V3 专业字段并增加 15 B RTCM 摘要；离线跨端、发布、引脚、调度、电池和 Windows 生产构建门禁均已通过。
- V5 实现已由 clean 提交 `4320616a364d30f1d76096dd91f16cb3e57d9dc7` 推送并生成唯一正式目录 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v5_rs485_gnss_simulated_20260804`。manifest SHA-256 为 `045b27c68acc6dc33ff0342a52ea294c1252dd383aff23f8a4c31b7efbcba734`；A/B/C `.img` SHA-256 为 `55fee708...c2653`、`b79d0850...f9de6`、`2529f3ad...ba56`。RK3568 V5 decoder/runner 已原子部署，备份 `/opt/lsmv2/backups/compact-v5-predeploy-20260804-120352`；兼容旧 V4 的部署后窗口为 `13/13`、零错误。节点尚未烧录 V5，下一步只剩按标签统一烧录和 V5 `60/600/1800`；RTCM/CORS 继续关闭。

### V5-r4 Hardware Gate: Framing Protected, 157 B Throughput Rejected (2026-08-04)

- 用户已按 A/B/C 标签烧录并上电 V5-r4。正式 `60/600/1800` 首轮的 60 秒为 `111/111`、零丢失/重复/未匹配/解码/profile/RTCM 错误，A/B/C arrival P95 为 `2072.4/1902.7/1901.8 ms`，通过；600 秒随后严格失败并停止，结果为 `793/813`、20 个缺帧和 20 个解码错误。错误精确成 10 组 `236 B + 78 B = 314 B`，即两个 157 B 帧在共享 XLS1 输出中交织；A/B/C 分别缺 `7/8/5` 帧，arrival P95 为 `3821.2/3939.8/3957.9 ms`，不能进入 1800 秒。
- 600 秒失败后的 G3S V5 查询中，A/B/C 均 `hardwareGatePassed=true`、soil/EC/tilt 当前有效、U4 正常、final failure/streak 为 0；低频 Modbus `no_response` 全部一次重试恢复。当前阻断不是 SC16IS752、RS485 探头、RTCM 或字段 profile。
- 生产网关原 `compact-targeted-v1/250/1200/0` 同步复现：549 次轮询中 90 次 session timeout，并出现相同的 236/78 交织。将接收保护窗单变量提高到 3000 ms 的对照短测为 `99/99`、零协议错误，A/B/C arrival P95 `2273.8/2158.5/2290.3 ms`；因此 1200/1500 ms 超时后过早发送下一节点是交织的直接触发条件。
- RK3568 已备份到 `/opt/lsmv2/backups/targeted-tail-window-predeploy-20260804-104141`，本地环境原子改为 `compact-targeted-v1/250/3000/0`，仍为 `root:root 0600`、`NTRIP_ENABLED=false`。3000 ms 是防止迟到帧撞上下一个节点的接收保护窗，不是性能放宽；验收器独立保留 command latency `<=1500 ms` 与 per-node arrival P95 `<=2500 ms`。
- 部署后正式 60 秒为 `57/57`、零通信/profile 错误，但 A/B/C command P95 `2249.1/2133.4/1832.3 ms`、arrival P95 `4449.2/4470.6/5121.5 ms`，严格速度失败。随后停住生产轮询并要求 15 秒连续静默，仍只得到 `60/60` 完整帧且 arrival P95 `4972.4/5380.6/4985.7 ms`，排除单纯历史队列积压。
- `DL-XLxx用户手册` 第 20、25、26 页给出机制证据：会话层标称载荷 `[0,64] B`，超过 64 B 只保证“可能成功”；用户串口按 50 ms 聚包，理想单向吞吐约 900 B/s，双向、同信道多节点、距离和干扰都会降低，并会以缓存表现为延迟。Compact V4 的 `139 B payload / 157 B wire frame` 至少占 3 个标称空口包，当前失败已收敛为周期帧尺寸与共享空口吞吐的架构瓶颈。
- 下一候选不得继续调大超时或降低门禁。周期遥测保留 Compact V3 已有的真实 soil/EC/tilt、电池、纳米度坐标、MSL/椭球高、GGA quality、卫星/HDOP、GST、correction age、GNSS 周时、Fixed 连续率和参考站字段；RTCM 只保留 session/lease、队列、最近完成年龄、注入计数和错误摘要，使完整 COBS/CRC 线上帧 `<=128 B`（最多两个 64 B 标称空口包）。完整累计计数继续由按需 G3S V5 提供，禁止周期发送 570 B 诊断帧。新协议完成离线审查和 A/B/C clean build 前不要求再次烧录。

### RS485 Diagnostic V5-r4 Poll Cadence Fix and Clean Release (2026-08-04)

- 用户按标签烧录 V5-r3 后，RK3568 前置门禁通过：`/dev/ttyS3`、网关 active/NRestarts=0、环境文件 `root:root 0600`、`NTRIP_ENABLED=false`。首轮 60 秒为 `90/90`、30/30 完整批次、零丢帧/重复/解析/profile/重发错误，但 C arrival P95 `2557.7 ms` 超过 `2500 ms`；第二轮为 `78/78`、26/26 完整批次、同样零通信与字段错误，但 A/B/C P95 为 `2640.0/2699.8/2675.8 ms`，再次严格失败。两轮报告 SHA-256 为 `84872026eac743e69a32e818a466eb1a44ec44a45e1a50423c42188c3505b180`、`30ec11f333b73edd555306385575e0c5fd928125bb97a8a21360c41e5dff0c4c`；原始 JSON 仅留 RK3568，不入 Git。
- G3S V5 三节点诊断均 `hardwareGatePassed=true`、当前 soil/EC/tilt 全有效、final failure/streak 为 0，U4/I2C/Modbus 无写入、CRC、短帧、地址、功能码或异常响应错误。运行约 500 周期后仅见低频 `no_response` 且全部一次补读恢复：A tilt 3 次，B EC 1 次/tilt 6 次，C soil 1 次/tilt 1 次；不能把它表述成坏传感器，也不能隐藏首次失败率。
- RK3568 旧诊断脚本只接受 G3S V4，已备份到 `/opt/lsmv2/backups/g3s-v5-probe-predeploy-20260804-094703` 并原子更新；`/usr/local/bin/xls1_gnss_v31_probe_sender.py` SHA-256 为 `2672f2f7ac9c7def01e6274a6d896f0ffb696ecaf22a21cd1afa33443d6d4bd2`，板端 self-test 通过。field-gateway 每次查询后均恢复 active、`NRestarts=0`。
- 对照启动摘要与源码发现真实调度缺陷：`POLL_REQUEST_CHECK_INTERVAL_MS=50` 且日志打印 50 ms，但 `DataUploadTask` 实际硬编码 `sleep_ms=200`。P2 A->B->C 单飞会逐节点累积这段反应抖动。V5-r4 改为 `DATA_UPLOAD_IDLE_CHECK_INTERVAL_MS`，轮询模式真实使用 50 ms；没有放宽 2500 ms 门限，也没有改变 RS485 重试、139 B 字段、RTCM 或 XLS1 参数。
- 新增 `test-rk2206-poll-cadence-safety.ps1`，拒绝硬编码 200 ms 回归。构建复核还拦截了清单生成器独立硬编码 V5-r3 的问题；构建器现在以 `landslide_main.c` 为版本标记唯一来源，只派生 compact v3/v4 令牌，并由 `test-rk2206-release-marker-source-safety.ps1` 门禁。
- 实现提交 `a6bb102f3f89eb50b72e08fc01922065d555cc31` 已推送。C99、Python、field-gateway `49/49` + lint、引脚正反例、发布安全、电池、TX 顺序、RS485 启动、轮询节奏、版本来源及 A/B/C OpenHarmony 全量编译全部通过。
- V5-r4 已按标签完成烧录并得到顶部所列真机结果；该目录与哈希继续保留追溯，但 600 秒通信/速度门禁失败，不能作为生产稳定或厘米级完成证据，也不应在没有新协议改动时重复烧录。

### [Superseded] RS485 Diagnostic V5-r3 Adversarial Audit and Clean Release (2026-08-03)

- 第二轮对抗性审查已完成并锁定 clean release：Compact V4 正常遥测保持 `139 B payload / 157 B complete frame`，不增加周期业务负载；G3S V5 仅按节点按需查询，payload `552 B`，C99 金值完整 field-link 帧实测 `570 B`，禁止周期轮询或多节点并发查询。固件标记为 `fw-rk2206-rtk-compact-v4-rs485-diag-v5-r3-20260803`。
- V5 按 soil/soil-EC/tilt/rain 分别累计 collection cycles、raw attempts、首次失败、retry recovery、final failure、skip、连续最终失败、最近状态/时间和采集时长。可选 EC 重探退避的 skip 不再覆盖最近真实 final-failure 证据；后续成功才记录 recovery。RK3568 TypeScript 与现场 Python 双端拒绝掩码、状态、事件、时间和饱和计数关系不可能的 V5。
- SC16IS752 连续 I2C 寄存器读取失败现在返回 `read_failed`，不再伪装为外部传感器 timeout；一次可重试失败前强制恢复缓存的 UART baud/clock 配置。U4 scratchpad/内部 FIFO 自检失败时，U4 与 RS485 两层启动日志都保持 `state=DEGRADED/WARN`，不再紧接误导性 `[OK]`，但保留采集以获取部分路径证据。
- 健康启动不再执行约 15 秒参数扫描。只有正常读取在一次有界重试后仍 final fail，才在首个原子快照保存后运行一次 read-only scan；扫描每次尝试喂狗并恢复双通道 1.8432 MHz/4800 8N1。工具区分 `runtime_collection_not_started`、`read_only_scan_in_progress` 和真实 restore failure。
- 最后一轮审查额外发现并修复 field-link TX 竞态：旧代码在 UART mutex 之外分配帧序号，多任务并发时可能让 `N+1` 先于 `N` 上线路，制造假 sequence gap/reset。V5-r3 将序号分配、COBS/CRC 编码和完整分块写入纳入同一把锁，并新增 `test-rk2206-field-link-tx-order-safety.ps1` 发布门禁。
- 离线门禁全部通过：C99 GNSS/RTCM、G3S V1-V5、V5 外层 encode/decode、RS485 retry/runtime、SC16IS752 cache；Python 语法/自检；field-gateway build、lint 和 `49/49`；26 源文件引脚正向与 3 项负例；发布安全正反例（含精确 marker 拒绝）；启动/扫描/发送顺序门禁；三节点电池 finalization/calibration/refinement 拒绝路径；`git diff --check`。
- 实现提交 `b6b49adbbfe0601570bb87b292d29f736c6a44ac` 已推送 `origin/feat/gnss-rtk-v31-transport`。正式目录为 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_rs485_diag_v5_r3_gnss_simulated_20260803`，manifest SHA-256 `96fdf0798ab5968abd58c6002e561e8f31b5804b2456c7db3e99021a27f2a6fc`；A/B/C `.img` SHA-256 为 `8f03f35ef3a26a4f38ef02235c042747371d2c030b29fbe7f412080f08dd1edc`、`73a3e873c3b66d2ce0a6865e7f1a2393a50e2d75b5b688fb18b917e5afe7cf80`、`ef4f8b4146f54f7f2bb5155aee2a4d41632267376cf2555387b61464c6cb4e9a`，loader SHA-256 `761d90888aa376156d562abf267dfe324b96c4397f7a601f6b4c64d0ea3bf977`。
- 正式目录当时独立复验为 `sourceDirty=false`、A/B/C 身份唯一、hardware RS485、simulated GNSS、UM220 UART 未初始化、RTCM disabled、final PC0 calibration 和 P2 singleflight。V5-r3 后续因可复现的 P95 性能失败和 200/50 ms 实现/日志不一致被 V5-r4 取代，禁止继续烧录。

### [Superseded] RS485 Retry1 / Fixed-Order Timing Candidate (2026-08-03)

- B 的近距离复测证明此前主要是射频距离问题：远距离 B-only 为 `42/63`，移近后为 `86/86`，因此 B 固件、SC16IS752 和两个 RS485 传感器不再按损坏处理。三节点 `1200 ms` 响应窗仍有 `76/78`，B/C 最大响应约 `1319/1324 ms`，并出现一组 `236 B + 78 B` 交织；固定 A -> B -> C 的 `1500 ms` 候选为 `102/102`，零通信错误，A/B/C 到达 P95 分别为 `2177.3/2161.9/2365.6 ms`，均低于 `2500 ms`。
- G3S V4 底层计数确认倾角失败全部为低频无响应：A `1498` 次请求中 `4` 次、B `2038` 中 `2` 次、C `1601` 中 `12` 次；没有 CRC、短帧、地址、功能码、写入或 TX 错误，当前三节点连续失败数均为 0。固件因此只对 timeout/read/short/CRC 做一次 `80 ms` 后补读；地址/异常/功能码/写入/TX 故障不重试，不缓存旧值，不放宽有效位。每次首次失败仍由 `rs485_modbus.c` 独立累计，补读不能掩盖故障率。
- 验收器已与生产固定 A -> B -> C 顺序对齐，并把候选契约收敛为 `response=1500 ms / session=1500 ms / XLS1 retries=0 / batch interval=250 ms / max per-node P95=2500 ms`。零重试时 session 只需覆盖一个响应窗，不再错误强制两倍窗口；报告新增不含坐标的 `profileViolationSamples`。RK3568 生产配置仍为 `compact-targeted-v1`、`1200/1200/0`、`NTRIP_ENABLED=false`，尚未切换候选。
- 实现提交 `f7a7e90442a90b94ec00402f981b561964408a35` 已推送 `origin/feat/gnss-rtk-v31-transport`。C99 主机测试、26 源文件引脚门禁、三项引脚负例、RS485 启动安全、发布安全、Python 金值/语法和 A/B/C OpenHarmony 全量编译均通过；构建链已补齐新增 retry-policy 头文件。启动标记为 `fw-rk2206-rtk-compact-v4-rs485-retry1-20260803`，串口摘要会显示 `max=1 gap=80 ms`。
- 历史 `rs485_retry1` 包曾通过当时门禁，但现已由上面的 V5-r3 路径取代，禁止继续烧录；其哈希只保留为历史追溯，不再是当前操作指令。
- RK3568 验收脚本已备份到 `/opt/lsmv2/backups/rs485-retry1-acceptance-predeploy-20260803-224256` 并更新；`xls1_compact_v4_acceptance.py` SHA-256 为 `f61d510d5822aefb446006339f6464e6b613c6330748cd9b3ef02f705ee1f413`，`xls1_three_node_batch_poll.py` 为 `77acbc412f141f3f193b332099dd07887a993fbdb9b773b173ee073d78d5ecfe`。远端语法和 simulated `--dry-run` 通过，field-gateway 与反向隧道 active、`NRestarts=0`。用户已将 A/B/C 下电并取走 RK3568 4G SIM；通用默认路由仍落到无 SIM 的 `usb0` 并超时，强制 `wlan0` 访问公网成功，但现有 guardian 已为生产云主机建立 `eth0` 专用路由，状态为 `cloud_reachable_via_ethernet_fallback`，1883/8080 均可达。因此明早纯 RS485 和现有云链不受影响；启用 CORS 前必须恢复 SIM 或为 CORS 单独确认可用出口。

### Indoor Real-RS485 / Simulated-GNSS Gate (2026-08-03)

- 用户确认两路 RS485 硬件已接入，原“接口未安装”的现场阻断解除。当前室内阶段明确采用独立源组合：XLS1 PB2/PB3、SC16IS752 PB4/PB5、土壤三合一、三轴倾角和 field-calibrated PC0 均为真实硬件；GNSS 为编译期模拟源，UM220 PB6/PB7 UART 不初始化，RTCM capability 编译为 disabled。
- Compact V4 状态位新增 `gnss_source=simulated` 证据。RK2206 构建器会清除 checksum/trusted/time/GST/correction-age/station/Fixed-statistics 证据；RK3568 再次拒绝“模拟 GNSS + trusted”矛盾帧并固定 `rtk_displacement_eligible=false`。服务器保留来源元数据，Windows 设备页和 GNSS 页显示“模拟输入”。模拟坐标不得进入 RTK baseline、ECEF/ENU、位移或厘米级结论。
- 室内验收器新增 `--required-gnss-source simulated`，仍强制 Compact V4、hardware RS485、真实土壤/EC/三轴倾角、field-calibrated PC0、RTCM disabled/零历史活动，并按 60/600/1800 秒失败即停。禁用 RTCM 桩已修正为三个 age 字段返回 `UINT32_MAX`，避免“从未发生”被误判为“刚发生 0 ms”；独立 C99 回归已覆盖。
- 离线门禁通过：RK2206 C99/禁用 RTCM、26 源文件引脚安全、发布安全、Python 金值与语法、field-gateway 46/46 + lint、telemetry-writer 14/14 + lint、API 10/10、Windows lint/production build。API 全仓 lint 仍有 68 个与本次未改路由相关的既有错误；本次 API build/test 通过，不在该硬件源切换中扩散修复。
- dirty 候选已完成 A/B/C 三次 OpenHarmony 全量编译链接，仅用于构建证明，目录为 `artifacts/firmware/rk2206-xl01-compact-v4-rs485-hardware-gnss-simulated-candidate-20260803`，明确 `sourceDirty=true`、禁止烧录。三个二进制均包含 SC16IS752/RS485 和模拟 GNSS 标记，不含 GPS UART 初始化/真实 GNSS 标记，且 A/B/C 身份唯一。下一步先提交并推送源码，再从干净提交构建正式 immutable 包。
- 实现提交 `22c20ad87c6e0927e9b459875258f118289960f7` 与发布一致性修复 `baf7e8ecfc052cbb57bcdc83902c16c7ed29ac5b` 均已推送到 `origin/feat/gnss-rtk-v31-transport`。首次正式打包被验证器正确拒绝：实际 capability 已 disabled，但旧启动标记仍硬编码 LIVE；修复后 capability、manifest 和二进制启动证据改为同一编译宏派生，并用单节点全量构建确认 `boot=DISABLED capability=DISABLED` 存在且 GPS UART 初始化标记不存在。
- 正式 A/B/C 室内包位于 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_rs485_hardware_gnss_simulated_20260803`，manifest SHA-256 `cf18a8b9c86457f47ccd692150ae2d64a87125cb3181082657f504f6884a38b5`；A/B/C `.img` SHA-256 为 `256d5072b29760411dcd164001528d7f70064933872db21f2057bbefbdc5f636`、`7d19be25f07ac7bd3c8bbe79622df2b1ed01ccce003e5551bec6d14867d3ff31`、`beba41f18c78ac593781098d9425116b6554fd42f4a051ba45bb4c7db564010c`，loader SHA-256 `761d90888aa376156d562abf267dfe324b96c4397f7a601f6b4c64d0ea3bf977`。独立复验为 `sourceDirty=false`、hardware RS485、simulated GNSS、RTCM disabled、最终 A/B/C PC0 校准、139/157 B、唯一身份及禁止标记全部通过。下一步是按物理标签烧录，不得使用 dirty candidate。
- RK3568 `192.168.124.179` 已确认运行与本地最新构建哈希一致的 field-gateway，配置为 `/dev/ttyS3`、115200、Compact broadcast、三节点轮询且 `NTRIP_ENABLED=false`。部署前备份位于 `/opt/lsmv2/backups/indoor-rs485-predeploy-20260803-170053`；两份现场脚本已原子更新，SHA-256 分别为 `c2759a0235e6254a9b2ea145d56ff479f11f270049922741b74c1b2cae0aa55d` 和 `aa8892e130c611758daed9f3af6fa1e7e992aa9e023f023109446d1c948496d7`。`--required-gnss-source simulated --check-prerequisites` 已通过，环境文件保持 `root:root 0600`，服务全程 active；尚未烧录正式包或执行 60/600/1800 秒真机门禁。

### In-Progress V4 Runtime Integration (2026-08-03)

- 用户已将 A/B/C 全部下电；本轮只做 RK3568、服务器、Windows 桌面端和离线固件发布包，禁止把离线软件测试误记为三节点真实链路或厘米级验收。明天烧录后仍需依次完成 V4 纯遥测、RTCM 会话确认、真实 CORS LIVE 和室外 `GGA=4` 门禁。
- RK2206 已形成 compact V4：139 字节 payload、157 字节完整 COBS/CRC 帧，前 95 字节与 V3 字段兼容，新增 44 字节为 RTCM 启动模式、运行时会话/租约、队列、最近动作年龄和累计错误证据。固件具备 LIVE capability，但开机强制 `DISABLED`；只有 RK3568 发送带目标掩码、非零会话号和有限租约的 19 字节控制命令后才允许 RTCM，重启或租约超时自动禁用。
- RK3568 已接入 NTRIP、GGA、RTCM3 解码/筛选、单份广播分片和三节点同会话确认。NTRIP 客户端新增兼容只有 `ICY 200 OK\r\n` 后直接输出 RTCM 的 v1 caster；密码不进入统计、健康文件或日志。串口写失败的 RTCM 分片会放回有界队列头部，利用节点端幂等分片处理重试，避免瞬时写失败必然造成整帧缺片；当前网关 45/45 测试通过。
- 服务器 `telemetry-writer` 已在生产部署：compact V4 与 V3 一样执行完整快照替换，清除旧空气温湿度、MPU6050 和过期 RTK 字段；V4 RTCM 指标与元数据已加入白名单，不再被丢弃。现网 offset 显式提交和有效 GPS 保留两项热修复均已保留；当前 14/14 测试通过，生产运行时 hook 也已证明 V4 替换语义。
- RK2206 主机协议金值通过：`compact_v4_payload_bytes=139`、`field_link_wire_bytes=157`；V3/V4 发布验证器正向与篡改/身份/模式/运行时启动状态拒绝路径通过。引脚门禁解析 `BUILD.gn` 中实际编译的 25 个 C 源文件，要求 `XLS1=EUART2_M1 PB2/PB3 MUX_FUNC3`、`GPS=EUART0_M0 PB6/PB7 MUX_FUNC2`、`BATTERY=PC0 ADC0 input-only`、`RS485=EI2C0_M0 PB4/PB5 MUX_FUNC4`，并拒绝编译旧 GPS/sensors、MPU6050 或 SHT30；错误 UART 引脚、错误 I2C mux 和误编译 MPU6050 三项负例均已证明会失败。
- Windows 桌面端字段契约已完成本地复核、lint、生产构建和原生包运行门禁：设备页、详情和 CSV 统一使用土壤温度/湿度/EC、三轴倾角、可信 RTK 与专业位移；不再读取空气温湿度、MPU6050 或旧 6 位小数坐标。坐标仅在 `rtk_trusted=true` 时以 9 位小数显示，缺失值显示“不可用”而不是伪造 0。42 字段 compact V4 writer 契约回归完整通过。RK3568、服务器、Windows 包和正式 A/B/C V4 包现已完成；剩余工作是真实三节点与室外 Fixed 验收，以及在可信 Fixed 样本成立后完成 ECEF/ENU、Hampel/Kalman 和服务器 CEEMDAN 的长周期算法门禁。生产轮询仍保持已通过 1800 秒门禁的 1000 ms + 部分响应一次有界重发；139 B 不是当前瓶颈，未经 1800 秒实机长测不得下调生产冷却。
- 正式固件源码提交为 `47cbddce3aab1d478087e45f95ff477f4a235d44`，已确认推送到 `origin/feat/gnss-rtk-v31-transport`。正式 A/B/C V4 hardware 包位于 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_hardware_live_20260803_r2`，manifest SHA-256 为 `1ee3a5f8402cb64c9bcf5997cfbe53e4b7c4bf430765b98e90a498189c672e7d`；A/B/C `.img` SHA-256 分别为 `7b5e775e72e4f3f5a29c8c0810d53aaf0a3bbba99ca8c07de7fa4eb4c2f7b70a`、`a1ed7806ee3d2237097c61586783d5b757234099427f83660f6a8f2dd48bfa00`、`eb6a744306c09832ee4c6012232eb7bcc7d82b78664ef3fa39f95d7538054773`，loader SHA-256 为 `761d90888aa376156d562abf267dfe324b96c4397f7a601f6b4c64d0ea3bf977`。发布验证为 `sourceDirty=false`、7 个预期固件文件、唯一 A/B/C 身份、V4 139/157 B、hardware、最终校准、LIVE capability、boot DISABLED、runtime finite lease control 全部通过；非 `r2` 目录已被取代。
- 2026-08-03 完成目标逐项复审并由 `c742b846` 收口可复现性：重新通过 25 源文件正向引脚门禁、错误 UART/错误 I2C mux/误编译 MPU6050 三项负例、正式 `r2` 发布安全、PC0 校准/修正/finalization 和 C99 协议金值。历史 simulated V3 A 二进制包含模拟标记且不含 `SC16IS752`/`EI2C0_M0 PB4/PB5`，正式 hardware V4 `r2` 则相反，证明模式切换没有靠运行时掩码假装关闭硬件。删除 `app_config.h` 中“MPU6050 移至 PB4/PB5”的遗留误导注释；RK3568 部署模板现固定已长测的 `1000 ms cooldown + 2500 ms session + partial-only retry 1 + 1200 ms window`，并新增直接读取模板的回归测试。该提交只修改源码注释、说明、部署模板和测试，不改变已构建 `r2` 二进制及其 `47cbddce` 来源绑定。
- 同一 `4b12eaab1483ac0883e2e87bd963ceedbe565476` 干净提交已全量构建 Compact V4 simulated A/B/C 演练包到 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_simulated_rehearsal_20260803`。manifest SHA-256 为 `771510d10093e2d85ad65b6d21fc9af44f67fd8348182725a4660aa94495b281`，A/B/C `.img` SHA-256 为 `3a5c39d4ea996a87fe9d9c9d97bd6f58ff077b3d559e763077b41f7a3e139ba1`、`c60f54c6327b32d7af643156c3c695b5fc522c06e09e09733088bd307a363907`、`24156b7b682b8f6e68865dc8b2d7188b77060b2462411f31d51a10997edb0ccc`。独立发布门禁确认 `sourceDirty=false`、唯一身份、field-calibrated PC0、139/157 B、LIVE capability、boot DISABLED、runtime lease control 和 `rs485HardwareInitialized=false`。三个 simulated 二进制均含模拟标记且不含 `SC16IS752`/`EI2C0_M0 PB4/PB5`；与 hardware `r2` 对比时 payload/wire/loader/RTCM runtime 契约完全一致，只有传感器源与 RS485 硬件路径不同。该包仅用于接口未安装时的安全链路演练，不得替代真实 RS485 的 hardware `r2` 验收。
- 完成性审计结论：离线范围内的 V4 固件、模拟/真实传感器构建切换、PC0 输入与逐节点校准、正反引脚门禁、字段契约、服务器/Windows/RK3568 软件、以及基于历史三节点链路接受的 `1000/2500/1/1200 ms` 恢复参数均有直接证据；但 139/157 B V4 hardware `r2` 尚未在真实 A/B/C 上完成烧录后的 60/600/1800 秒门禁，真实 RS485 有效位、V4 长测丢帧率和现场供电/插接安全因此仍未证明。该阻断已连续多轮存在，且必须由用户现场确认 C 独立供电消失、按标签烧录 hardware `r2` 并全部上电后才能解除；在此之前不得宣称完整目标、真实三节点或厘米级链路完成。
- RK3568 V4 网关已备份并部署，回滚目录 `/home/linaro/lsmv2-backups/field-gateway-pre-compact-v4-20260803-021718`。`dist/index.js` 与 `dist/compact-telemetry.js` SHA-256 为 `535a850d9cbb980e6f57930153fdfbda9774297ed90597f8ba09fbf7404a08b6`、`331d2b2f58b2d18ec97f2fbebab89af3be2d14976d5d7c3b083aa0ded0d223c3`；环境文件保持 `600 root:root` 并显式设置 `NTRIP_ENABLED=false`。服务 active、`NRestarts=0`、串口 open，schema/写入/RTCM 错误均为 0。健康文件显示 C 仍在持续发旧 compact V2，A/B 无新帧，因此用户所述 A/B/C 全下电与实际状态不一致；该段不计作 V4 真机验收。
- 审计发现旧 `xls1_three_node_batch_poll.py` 只识别 46 B V1/V2，无法验收 95/139 B V3/V4；已由提交 `97473b62` 补齐与 RK3568 一致的 V3/V4 定点解码、可信 RTK 约束、硬件土壤/EC/三轴倾角范围、field-calibrated PC0 和 RTCM fail-closed/零历史活动门禁。新增 `xls1_compact_v4_acceptance.py` 一次持有网关服务，按 60/600/1800 秒失败即停、逐段原子写 JSON 和 SHA-256，并在任何退出路径恢复服务；`97a60d2a` 又将旧 V2 缺失 RTCM 证据收敛为明确的版本错误，不再产生误导性 not-zero 噪声。完整规程见 `docs/field-tests/rk2206-compact-v4-hardware-acceptance.md`。
- 两个验收脚本已部署到 RK3568 `/usr/local/bin`，当前 SHA-256 分别为 `b4db5100cdc03d7c452cd35d8afec307450c77f22b6b414a4579d12bf6275d7a`、`d29b5171ca64c05507196920f436202c6d7b98fe79a83fa60858b8c17ef4a7ba`；最新脚本回滚目录 `/home/linaro/lsmv2-backups/field-test-diagnostics-97a60d2a-20260803-031920`。无发送 `--check-prerequisites` 确认环境文件 `0600 root:root`、NTRIP false、`/dev/ttyS3` 为字符设备、服务 active 且 `NRestarts=0`。
- ABC 声称下电期间执行了 1 秒预期失败自测，只发普通 P1 且不启用 RTCM。验收器正确停止在第一阶段、写入报告、删除 `/run` hold 并恢复网关 active、`RefuseManualStart=no`、`NRestarts=0`；summary 位于 `/var/lib/lsmv2/experiments/runner-selftest-20260803/xls1-compact-v4-acceptance-20260803-031648.json`，SHA-256 `dc8b03fc202de2e77196f59141b1e0c6cc267ec5d242683296230aa75c421252`。A/B 无响应，但 C 对当前标签和重发均应答，共观测 3 个 V2 simulated 帧、序号 `11458..11460` 连续，因此 C 端当前确实仍有供电，不是健康文件残留；明天烧录前必须先处理。
- 生产服务器备份位于 `/opt/lsmv2-production/backups/server-pre-rtk-v4-20260803-0230`。写入器镜像 `sha256:b3f744437ded557f11902b05f32e327f65df61adb1d044c1aeafa06596809534`，API 镜像 `sha256:2d1ea4dea9a836974aec2739d3c1fe2e1d82848f92869b184c6d2de30da6da7c`；回滚标签分别为 `rollback-compact-v4-20260803-0230`、`rollback-rtk-v4-20260803-0230`。两容器 running、`RestartCount=0`，写入器持续成功写 ClickHouse，API `/health` 正常，最近 error/fatal 为 0。
- Windows 便携包位于 `artifacts/windows/portable-rtk-v4-fields-20260803`，`LandslideDesk.Win.exe` SHA-256 为 `26c2c609755e0ab68188a4a7bec6333d9d47a10f20472c6069014c4ea6c683d8`。原生壳 ready handshake 通过，静置 15 秒无前端 runtime error，验证后测试进程已停止。

### Authoritative Latest State (2026-08-03)

- `49eb7544` 已完成 `compact v3` 合并快照：RK2206 以 95 字节 payload、113 字节完整 COBS/CRC 帧同时发送 PC0 电池、RS485 土壤/EC、独立 RS485 三轴倾角和专业 RTK 证据。活跃构建、采集结构和 payload 已移除 SHT30、MPU6050 加速度/角速度/姿态；RS-DIP-N01-1 `tilt_x/y/z` 保留。常规链路不再另发第二个高频 GNSS 包，完整字节契约见 `docs/field-tests/rk2206-compact-v3-rtk-telemetry.md`。
- GNSS 解析使用有符号纳度、毫米和毫秒定点值；仅当前 checksum-valid `GGA=4`、坐标/坐标系有效、差分龄 `<=5000 ms`、解算龄 `<=2000 ms` 时设置 `trusted`。RMC 日期必须不旧于 2.5 秒才可与当前 GGA 组合生成 GNSS week/TOW，GST 也在 2.5 秒后独立失效，避免旧辅助证据污染当前历元。
- `FieldSensorMode=simulated` 只模拟 RS485 土壤/EC/倾角，真实 UM220、XLS1 和 PC0 保持启用；SC16IS752 不进入模拟二进制且 PB4/PB5 不初始化。静态门禁再次通过：`XLS1=PB2/PB3`、`GPS=PB6/PB7`、`BATTERY=PC0-input`、`RS485=PB4/PB5-hardware-only`。RTCM injection 仍为 disabled。
- RK2206 C99 主机测试、GNSS 解析、95/113 字节金值、发布包篡改/身份/模式/最终电池验收拒绝路径、电池生成/修正/finalization 全通过；field-gateway 31/31 测试、TypeScript build/lint 通过。`49eb7544` 与记忆提交 `deb0929d` 已推送到远端 `feat/gnss-rtk-v31-transport`。
- 正式 A/B/C simulated V3 包已从干净且已推送的 `deb0929dfc3f7412b665272a6424fc2dad35c5c2` 全量构建到 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v3_final_simulated_20260803`。manifest SHA-256 为 `fd917730d17bf4da4437df17c60f785780d4f1e79f55a9d9058c3427e4b49fab`；A/B/C `.img` SHA-256 分别为 `b71e130e03bdf7fc81bdd571bc005b278611ae48c8b4506b4b6830a505997afd`、`d3b9cee3a58a4ef66ab089794e7b56abe438dd6cf6004f582d9eb1d6ce0bcc5c`、`b306bb56d21fbc9d27ba9208d8c2123a857cfdf47542376984658e6b21a95eea`。独立验证为 `sourceDirty=false`、95 字节 payload、113 字节完整帧、精确 7 个固件文件、A/B/C 唯一身份、RS485 simulated、`rs485HardwareInitialized=false`、RTCM disabled、最终电池校准已验收，并通过 `PIN_SAFETY_OK`；此前 dirty 候选继续禁止使用。
- RK3568 field-gateway 已部署 v3 解码器：`index.js` SHA-256 `8827e5bd1e034d38dfcded845de0c28743783d02f957aa699b50f62d5a5ebd91`，`compact-telemetry.js` SHA-256 `b47266eb9e80315597b351543ee53530bc07bf5ad1b7f21225a2a6702754b126`，回滚目录 `/home/linaro/lsmv2-backups/field-gateway-pre-compact-v3-20260802-235641`。部署后 25/25 完整轮、75/75 帧，A/B/C 各 25，零 timeout/retry/duplicate/unmatched/schema reject/interleaving/spool pending；当前物理节点仍运行旧 compact v2，因此这只是向后兼容门禁，不是 v3 真机验收。
- 生产服务器 `telemetry-writer` 已部署镜像 `sha256:42f7f668c712117c3f31d92e305d446bc14921518fc3623f17d64496aad723ae`，标签 `lsmv2/telemetry-writer:compact-v3-20260803-001633`；旧镜像保留为 `rollback-compact-v3-20260803-001633`，源码/容器备份位于 `/opt/lsmv2-production/backups/telemetry-writer-pre-compact-v3-20260803-001633`。容器保持 running、`RestartCount=0`，持续消费 Kafka 并成功写 ClickHouse，无 error/fatal/DLQ 日志。
- 服务器部署合并并回流了两项不能丢失的生产热修复：关闭 Kafka auto-commit 时显式提交 resolved offsets；无效旧 GPS 样本不覆盖最后有效坐标。候选 builder 和本地均为 12/12 测试通过。实际运行镜像 hook 已证明 v3 完整快照会清除旧 `accel_*`、空气温度和过期 RTK 坐标，而 v1/v2 继续稀疏合并。

### Authoritative Latest State (2026-08-02)

- A/B/C 已烧录节点专属 `xls1_link_rehearsal_battery_simulated_20260801` 镜像并同时在线。当前只模拟 RS485 土壤/EC/倾角；UM220 GNSS、PC0 电池和 XLS1 传输链为真实硬件，RTCM injection 为 disabled。
- field-gateway 保持每串口单广播在途，现以 1200 ms 为首响应窗、部分响应时同标签最多重发一次、2500 ms 为总会话上限，完成后冷却 1000 ms，全节点空响应时 2000..30000 ms 指数退避；调度和延迟使用单调时钟。28/28 测试、TypeScript build/lint 和差异检查通过。
- 600 秒严格门禁完成 310 轮、930/930 帧，A/B/C 各 310/310，序号 570..879 全连续，零重复、回退、未匹配、残帧、解码和 profile 错误。报告仅保留在 RK3568 `/var/lib/lsmv2/experiments/xls1-three-node-batch-poll-20260802-004710.json`，SHA-256 `a1341efba950f8cd36e04b627078ec1741a559f41b78e1705fe4160ad2916a63`；A/B/C 最大命令延迟为 315.6/641.7/955.1 ms。
- RK3568 重新上电后又连续观测 93 轮：新增 279 帧，严格等于 `93 x 3`，三节点序号各前进 93；最后一轮 3/3，所有空轮、重复、未匹配、解析拒绝和交织计数仍为 0。`lsmv2-field-gateway.service` 为 enabled、active/running、`Restart=always`、`NRestarts=0`。
- 最终网关与门禁脚本 SHA-256 分别为 `f66d5ed7165c8810248df4cd4bb7ba4f3e09a01ea96f7781893594ceae6bc3d8` 和 `d4094733f8d363bb8d85e565e3779604df6a8ba08d460ec6e1363581011e8e9d`。测试 hold 使用 `/run` drop-in 并已验证必定恢复服务。
- 当前约 1.94 秒完成一轮，因为 1000 ms 是会话关闭后的冷却，不是固定 1 Hz。当前基线追求零丢帧，不为比赛显示伪称每秒三节点齐采。
- 最终 1800 秒报告每节点均有 929 个电池样本：A 固定 10.997 V，B 为 10.967..10.982 V（中位数 10.971 V），C 为 11.770..11.771 V（中位数 11.770 V），采样噪声满足一点评估增益条件；三节点仍属 `default-calibration`，必须结合同时万用表值再解释百分比或续航。RS485 硬件到位后只通过构建参数切回 hardware，并重新做完整门禁。
- RK3568 已恢复并固定以 4G `usb0` 为主链路，默认路由 metric 50；`wlan0` 仅作为 metric 600 的自动备用，不再人工切换网线。云端反向端口、MQTT、Hermes 和告警链路均已验证经蜂窝出口在线。
- 2026-08-02 16:48 CST 在用户更换大流量 SIM 后经云端反向 SSH 复核：SIM/注册/附着/`cmnet` 均正常，`usb0=192.168.43.100/24`、RSSI 31；默认路由和云端主机路由均走 `usb0`，反向 SSH 及两条 MQTT 长连接的源地址也都是 `192.168.43.100`。`eth0` 即使插线也保持 `ipv4.never-default=yes`、metric 200，只提供 `192.168.124.0/24` 局域网路由。蜂窝检测、链路守护、反向隧道、field-gateway 与 Hermes 均为 enabled/active；后续不再为测试人工切换公网出口。
- 4G 上 950 ms 的 600 秒严格门禁为 310/310 完整轮、930/930 帧且零错误；900/850/800 ms 均通过 60 秒预检。但 800 ms 的 1800 秒最终门禁仅 1014/1021 完整轮、3056/3063 帧，A/B/C 分别缺 6/1/0，故 800 ms 被拒绝。报告 SHA-256 为 `9330bcddd2127d302a86783f5dfcb1b794ea3dcdd9c7d036c970b48ca97281bc`，生产保持 1000 ms，不部署 950 ms 的边际提速。
- 800 ms 失败中三节点已接收序号仍连续，且重复、回退、未匹配、解码、profile、残帧错误均为 0；问题表现为长测下零星轮次无应答，不是 4G 中断。门禁退出后 field-gateway 自动恢复，复核 118 轮、354 帧、0 timeout、最近一轮 3/3，MQTT connected。
- 1000 ms 无重发的 1800 秒基线同样真实失败：917 轮中 911 完整、6 部分，A/B/C 缺 `4/2/0` 帧；已收序号仍全部连续且协议错误为 0。报告 SHA-256 `ba8315faa13e645647a87ded8cdb42ed193c1d64a7acb3ca5353f9d75620b7b1`。因此问题不是单纯冷却过短，继续调大/调小 interval 不能消除低频空口无应答。
- 已验证并部署同标签有界恢复：首个响应窗 1200 ms，仅在部分响应时把同一 `P1` 最多重发一次，总会话 2500 ms，完成后仍冷却 1000 ms。500 ms 强制门禁让 11/11 轮实际走重发且 33/33 逻辑帧完整；真实 600 秒为 310/310 轮、930/930 帧，1 次重发（0.3226%）在重发发出后匹配缺失 A，最大逻辑时延 1503.8 ms，2 个预期冗余帧被独立分类；最终 1800 秒为 929/929 轮、2787/2787 帧、零错误且无需重发。600/1800 秒报告哈希分别为 `fff4792c3b0f28ba4d5b09222ede60e0f8dc1d60107cd600f042ad6643ca2ceb`、`0cc143af8102924d80de0823ce99d3cbe072db2e288e52880f7c368bda66998a`。
- 生产网关已启用 `SESSION_TIMEOUT=2500`、`PARTIAL_RETRIES=1`、`RETRY_AFTER=1200`，并新增重发命令/写失败/重发后匹配/每节点一次冗余/重发率及单调时延健康指标；默认配置仍为重发关闭，避免其他部署静默改变行为。对抗性复核进一步限定只有 `1..N-1` 部分响应才重发，全空窗口直接进入原指数退避；每节点只豁免一个预期重发副本，后续副本仍算真实重复。当前 RK3568 回滚目录为 `/home/linaro/lsmv2-backups/field-gateway-pre-empty-retry-boundary-20260802-163637`，部署 `index.js/config.js/compact-poll-retry.js` 哈希分别为 `849f0365...c15a67`、`903ffbb9...24f36`、`320f0b14...2a52a71b`。
- 部署后生产健康快照已累计到 536/536 轮、1608/1608 三节点匹配帧，A/B/C online；重发、超时、重复、未匹配和解析拒绝均为 0，spool pending 为 0，串口与 MQTT 在线。该快照证明部署无回归；自然重发成功仍由独立 600 秒严格门禁提供证据。
- 空窗口/冗余边界修正版受控重启后重新累计 61/61 轮、183/183 帧；重发、重发写失败、超时、重复、未匹配、解析拒绝和 spool 均为 0。field-gateway、Hermes、反向 SSH 均 active，公网到云服务器仍明确走 4G `usb0`。
- 有界重发实现、现场门禁工具、测试、部署证据与本 task/checkpoint 已作为 `06749252ac251f482498e099884140adbbc79ddb` 推送到远端 `feat/gnss-rtk-v31-transport`；提交内容已扫描确认不含 CORS 凭据、私钥、真实坐标或原始报告。
- 新增 `verify-rk2206-release-safety.ps1`，同时验证 manifest schema/profile、完整文件集合和 SHA-256、A/B/C `.bin` 与实际烧录 `.img` 身份、模拟/硬件标记、RTCM 模式、PC0 输入路径以及默认/现场电池校准状态。回归测试已覆盖模拟与硬件正向包，以及 `.img` 篡改、同步改清单哈希后的跨节点身份污染、硬件包冒充模拟包三类拒绝路径。当前正式模拟包已由该验证器通过，PC0 静态引脚门禁和电池校准生成器测试也再次通过。
- 已从干净提交 `50890f9ec1f9a685d08e34aa574373bb7f9f34c8` 构建早期未校准 hardware 预检包 `xls1_rs485_hardware_preflight_uncalibrated_20260802`；该包现已被后述最终校准包取代，不再烧录。其历史构建只用于证明 `FieldSensorMode=hardware` 可恢复 SC16IS752/RS485 路径，不能替代实物 RS485 验收。
- 2026-08-02 19:44 CST 完成 B 节点 PC0 单点校准采集。严格窗口为 32/32 完整轮、96/96 帧，零缺失、重发、解码、身份、序号和残帧错误；B 电池 32 个样本为 10.906..10.907 V，中位数 10.906 V、窗口跨度 1 mV，质量仍为 `default-calibration`。用户在该连续测量过程前后两次确认万用表三次读数均为 11.52 V，即 11520 mV；候选增益为 `1056299 ppm`、偏移 0。报告仅留在 RK3568 `/var/lib/lsmv2/experiments/xls1-three-node-battery-B-20260802-1944.json`，SHA-256 `4bb030f75d5f75cf80926a12ad7c6d72d72b579620f4a321bf66e5e8b3370149`；A/C 独立窗口未完成前不生成或烧录半套校准固件。
- 2026-08-02 19:53 CST 完成 C 节点 PC0 单点校准采集：32/32 完整轮、96/96 帧，零缺失、重发、解码、身份、序号和残帧错误；C 电池 32 个样本为 11.704..11.706 V，中位数 11.706 V、窗口跨度 2 mV，质量仍为 `default-calibration`。用户确认万用表稳定为 11.52 V，且测量正极就是直接连接分压电阻上端的电源模块引脚，即 R1.3 的 `VBAT_SW` 真值；C 候选增益为 `984111 ppm`、偏移 0。报告仅留在 RK3568 `/var/lib/lsmv2/experiments/xls1-three-node-battery-C-20260802-1953.json`，SHA-256 `3c6bba723fee7ee1c211fa6a926520a8a4eb544637c903a64185faa222237b35`。A 独立窗口未完成前不生成或烧录半套校准固件。
- 2026-08-02 20:10 CST 完成 A 节点 PC0 单点校准采集：31/31 完整轮、93/93 帧，零缺失、重发、解码、身份、序号和残帧错误；A 电池 31 个样本固定为 10.931 V，用户在同步窗口内确认 `VBAT_SW` 为 11.44 V，即 11440 mV，候选增益为 `1046565 ppm`、偏移 0。报告仅留在 RK3568 `/var/lib/lsmv2/experiments/xls1-three-node-battery-A-20260802-2010.json`，SHA-256 `ec8f8a5c06713685e86eea162cf6dcd17ec797c8755622d4e05a43e5caff3366`。
- A/B/C 三份独立报告已按哈希下载到非 Git 目录 `output/rk2206-battery-calibration-20260802`，逐节点生成 `battery-calibration.json`：A/B/C 为 `1046565/1056299/984111 ppm`，文件 SHA-256 `678f7c36e160e1e4259367ea40690dd4e87369b9c36ee77ac918d32f4192a87b`。生成器现向后兼容单报告，并支持 `-ReportPathA/-ReportPathB/-ReportPathC`；每份报告独立执行稳定门禁并在输出中记录路径与 SHA-256，相关正向/拒绝回归测试通过。
- 从干净提交 `b084f10aaa47edd4e6039d2a422b441197c84f8f` 构建首轮校准模拟包 `F:\2\openharmony\rk2206_firmware_releases\xls1_link_rehearsal_battery_calibrated_20260802`。manifest 为 `sourceDirty=false`、RS485 simulated、`rs485HardwareInitialized=false`、RTCM disabled、三节点 `field-calibrated`；发布验证器、PC0 引脚安全门禁和校准生成器回归均通过。A/B/C `.img` SHA-256 分别为 `92af5fded3b3c71865a688e6e4e4b3a81f114785b41f9b7cf79471c149bbd10a`、`d10a4b3a171141c4647179b3fa6f0ae707b18ebb274c93414e3e7199dca1dfff`、`25d2184c4efc63f7505a05e2e730d19a288f14137e2285c6fcbc985012732434`。烧录后 B 的同步复测未达到 60 mV 精度门槛，因此该目录的 B 镜像已被迭代候选取代；在该阶段 A/C 尚未同步验收，后续条目已完成闭环。
- `F:\2\openharmony\rk2206_firmware_releases\xls1_rs485_hardware_preflight_calibrated_20260802` 使用首轮校准文件，B 增益仍为 `1056299 ppm`，现已过期并继续禁止烧录；即使接口元件安装完成也必须等待最终三节点校准验收后重建，不得绕过 `DO-NOT-FLASH` 门禁。
- B 首轮烧录后修正版严格报告为 31/31 轮、93/93 帧、零错误且 `stableProfile=true`；B 的 31 个样本为 `11584..11586 mV`、中位数 `11586 mV`，万用表首尾均为 `11500 mV`，误差 `+86 mV`，报告 SHA-256 `5cd603a251494125624e01e3e9b0d66508286aa6c7ebab2d5feb0068eb559085`。`refine-rk2206-battery-calibration.ps1` 强制核对旧校准/发布 manifest 哈希、严格门禁、样本数、当前质量、板端/万用表稳定性和支持范围；金值及不稳定报告、错误质量、万用表漂移、错误发布来源四类拒绝测试通过。B 候选增益为 `1048458 ppm`，候选校准 SHA-256 `ae7638c8e20efedbbbfb6c3bf1f2a6b20c36fefee892e91d0946c192d8536726`。干净提交 `f78aab76a85d0180cb34cf8411ac4e881787f6a8` 构建的 simulated 候选包在 `F:\2\openharmony\rk2206_firmware_releases\xls1_link_rehearsal_battery_refined_B_candidate_20260802`；A/B/C 增益为 `1046565/1048458/984111 ppm`，B `.img` SHA-256 `5136225519aa6336a8cb979270214ff9c826c45265f9134874b18b7c9267b0f2`，包再次通过 `RELEASE_SAFETY_OK` 且三个 `.bin` 的 RS485/PB4/PB5 实现标记零命中。RK3568 门禁报告已补记 `maxP95IntervalMs`，部署 SHA-256 `099e6b197849c7e7db52ae6e2b83bda500e5710fbdec02b1f1da4dbef0a56ad2`，field-gateway 保持 active、`NRestarts=0`。
- 2026-08-02 B 修正候选烧录后的同步验收通过：严格窗口 31/31 轮、93/93 帧，`stableProfile=true`，零缺失、重发、解码、profile、未匹配、重复和残帧错误；B 的 31 个 PC0 样本全部为 `11507 mV`，`estimateQuality=field-calibrated`，同步万用表首尾均为 `11500 mV`，误差仅 `+7 mV`，满足 `<=60 mV` 验收门槛。最终接受 B 增益 `1048458 ppm`。原始报告已按 SHA-256 `a4fce627cdc1e371cedb217fa688191695f2afdd3db44309a720fbcbb35fc05e` 下载到非 Git `output/rk2206-battery-calibration-20260802/xls1-three-node-battery-B-refined-verify-20260802.json`；A/C 仍必须用当前同步万用表真值分别复测，不能沿用此前异步表值直接验收。
- C 当前固件的同步严格窗口同样为 31/31 轮、93/93 帧且所有通信错误为 0；C 的 31 个样本固定为 `11389 mV`，万用表首尾均为 `11500 mV`，误差 `-111 mV`，因此通信通过但绝对精度被 `<=60 mV` 门槛拒绝。报告 SHA-256 为 `bd8dfe5ce1dd50f6c3134831df99ca15d96843f231a29a6b8f79ce17cf277183`。从已接受 B 的校准文件迭代得到 C 候选增益 `993702 ppm`，候选校准文件位于非 Git `output/rk2206-battery-calibration-20260802/battery-calibration-refined-C-candidate.json`，SHA-256 `e0ee946dcf1a2ef11c113cf201106ae845d590036b3b6b1306b39aa1356eadb4`；必须只刷 C 候选并完成烧录后同步复测，不能直接接受候选计算值。
- C 修正候选从干净提交 `a7cf9fbb0af7944af0a6906241774397e6d8ecda` 构建在 `F:\2\openharmony\rk2206_firmware_releases\xls1_link_rehearsal_battery_refined_C_candidate_20260802`，C `.img` SHA-256 为 `b3b57903e68c5b1ff417e1b184b6cd95d2ae5a2babc0db74edc39003360979f7`；manifest 为 `sourceDirty=false`、simulated、RTCM disabled、`rs485HardwareInitialized=false`，C 二进制不含 SC16IS752/RS485/PB4-PB5 标记并通过独立 `RELEASE_SAFETY_OK`。烧录后 C 最终验收为 31/31 轮、93/93 帧、零通信错误，31 个样本 `11490..11492 mV`、中位数 `11491 mV`，万用表末值在 `11490..11500 mV` 间跳动；即使按最不利端点，绝对误差也仅 `9 mV`，满足 `<=60 mV`。正式接受 C 增益 `993702 ppm`。报告 SHA-256 `055c62cc044136271901c82b7006825e3704efd426407f315433eb9eb84b26ff` 已下载到非 Git `output/`；该阶段仅 A 尚未同步复测，下一条已完成验收。
- A 当前 `1046565 ppm` 固件的最终同步验收通过：严格窗口 31/31 轮、93/93 帧，零缺失、重发、解码、profile、未匹配、重复和残帧错误；A 的中位数为 `11429 mV`，同步万用表为 `11420 mV`，误差 `+9 mV`，满足 `<=60 mV`。报告位于非 Git `output/rk2206-battery-calibration-20260802/xls1-three-node-battery-A-verify-20260802.json`，SHA-256 `7895dc62cda455607b6ec503e2f41e92e89d7c32451c9ae13ecd7e1d4ff185f7`。
- A/B/C 电池单点校准已全部验收：最终增益分别为 `1046565/1048458/993702 ppm`，绝对误差分别为 `+9/+7/最坏 9 mV`，全部满足 `<=60 mV` 门槛。正式验收文件为非 Git `output/rk2206-battery-calibration-20260802/battery-calibration-final-accepted-20260802.json`，SHA-256 `73807fd83bd38cd132a680ab59421afe08817af78bfc7d3ebaf13f3c97841a3c`；它绑定三份最终 `31/31` 轮、`93/93` 帧、零错误报告、三份实际烧录包 manifest 和同步万用表端点。新增 finalizer 与发布验证器会拒绝不稳定、通信错误、manifest 增益不一致、误差超过 60 mV、伪造算术和缺少最终验收的 calibrated 包。
- 最终 simulated 包已从干净提交 `6025fa89bdb73d35bbd3c902e14927ac8f2e69ca` 全量构建到 `F:\2\openharmony\rk2206_firmware_releases\xls1_link_rehearsal_battery_final_20260802`；manifest SHA-256 `2dd57ca0a2c44f9fa35768a216621f962cc5c9fb031f9db4c8f4d72fc1e824ca`，A/B/C `.img` SHA-256 分别为 `b2048c5f219dd91f2017f1465c8eb91ece79428242c927d3412b05f8fa7bea1d`、`078d742b80a464cb2a7cf24e330dc7c5a0ca5e834e024520388465f3e6281f82`、`548a2dc7148204c77c846507f3e9e507fb6f98724261835e2cd34c1511a680f8`。该包为 `simulated`、RTCM disabled、`rs485HardwareInitialized=false`，PB4/PB5 实现标记被门禁拒绝，GPS/PC0/XLS1 保持真实。
- 最终 hardware 预检包位于 `F:\2\openharmony\rk2206_firmware_releases\xls1_rs485_hardware_preflight_final_20260802`；manifest SHA-256 `bb71c9a6e4d86c1b62be9a8c3806d2a300af1a942283086554696f08ca2d2427`，A/B/C `.img` SHA-256 分别为 `0c0ce5a928c9861f4c9afefde6a80402593e56a1fe9db5b405a3e938a4bbbea6`、`8d3cc38180451b95dd917764a3198527f5eccad5f17c0b7415e5a2c90170ab48`、`736d8ce963121a6d1d2bb638fc4df0445c82380194d14f7d9f2f6ef3b957c08f`。它明确包含 SC16IS752/RS485 PB4/PB5 路径并带 `DO-NOT-FLASH-UNTIL-RS485-INSTALLED.txt`；接口安装、断电连续性/短路/方向、首次上电 3.3 V/PB4/PB5 和 `0x4D` 门禁通过前禁止烧录。两包 loader 相同，SHA-256 `761d90888aa376156d562abf267dfe324b96c4397f7a601f6b4c64d0ea3bf977`；独立复验和 simulated/hardware 交叉模式拒绝均通过，构建工作树保持 clean。
- 2026-08-02 完成 RK2206 OTA 只读审计：当前板级 HOTA HAL 的写入、启动切换、重启、回滚和元数据接口是空操作或假成功，分区表/公钥为空，应用未链接 HOTA 调用，生产镜像只有单 `liteos` 槽。当前 A/B/C 严禁远程写固件；先在可有线救援的备用板验证 A/B 引导、签名、原子元数据、健康确认和掉电回滚，正式节点随后各需最后一次有线迁移。迁移完成后，常规 OTA 写非活动槽并软件重启，不需要人工下电。审计过程未修改或烧录任何现场固件。
- 同次排障确认此前 RK3568 离线根因为其自身电池耗尽，不是 4G/Wi-Fi 路由或 field-gateway 故障。重新上电后局域网 SSH、4G `usb0` 默认路由和 field-gateway 均恢复，服务 `NRestarts=0`。反向隧道一度表现为本地 systemd `active` 但云端 22079 未监听；19:49 CST 只重启 `lsmv2-rk3568-reverse-tunnel.service` 后，云端直接确认 `127.0.0.1:22079/28081/28082/28087` 全部重新监听并出现新的 `rk3568-tunnel` 会话，公网路由仍为 `usb0 metric 50`。A/B/C 节点 PC0 电压不能替代 RK3568 自身电池状态，后续需单独确认网关电源监测接口及低电量告警/安全关机能力。
- RK3568 电源接口只读审计显示 `/sys/class/power_supply` 为空，系统没有可直接使用的电池/充电器驱动；板上 `fe720000.saradc` 暴露 8 路 10-bit ADC，当前仅通道 2 约为 1.50 V，其余多为满量程，但设备树只明确把 SARADC 通道 0 分配给 `adc-keys`，没有 battery/charger/fuel-gauge 节点或电池分压映射。不得把任意 ADC 原始值解释成 RK3568 电量；需结合 KICKPI/RK3568 原理图确认空闲 ADC 是否接到电池分压，若没有则增加受保护分压输入或独立电量计，再实现网关低电量告警和安全关机。

### Prior Engineering Evidence

- PC NTRIP、RTCM3 CRC、原始串口注入和 BT-760 RTK Fixed 已验证，3 套 BT-760 已到货。
- `4ed2ce5b` 已完成 V3.1 `GNSS_CORE`/RTCM 有界协议；`e00107ed` 已完成默认关闭的 RK2206 重组、队列、CRC、统计和单任务 GNSS UART 注入边界。
- 主机测试、field-gateway 回归/lint 及固件交叉编译均通过。A/B 有正常遥测；2026-07-28 C 已通过定向 `G3S` V2、`G3A` ACK V1、普通轮询 ACK 和 1 秒 4/4 分片、3/3 帧闭环，身份为 `...0003`，证明 XLS1 双向控制链在线。C 仍没有 compact 遥测，问题已收敛到 RK2206 传感器采样/遥测生成路径，不能再表述为 XLS1 未配对或节点无线离线。
- 已实现 RK3568-only 闭环计数：RK3568 以定向 nonce 查询节点，RK2206 在任务上下文通过 `control=4` 回传固定 92 字节统计快照；发送器以前后快照的 uint32 差值自动核对 accepted/completed/PROBE/bytes、队列、CRC 和注入错误。该路径不使用 PC 调试 UART，且 `PROBE` 不写 UM220。
- RK3568 旧发送器已向 A 发送 12 s 的 `32B/15ms` 基线（76 帧/100 分片）且网关自动恢复，但旧固件不能回传计数，所以该结果仍不是硬件门禁通过。
- 新 A/B/C `PROBE-stats` 包已由提交 `50c3ec3b` 独立全量构建到 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_stats_20260727`，9 个二进制哈希、三节点身份、固件标记和 PROBE 模式均通过复核。闭环发送器已部署到 RK3568 `/usr/local/bin/xls1_gnss_v31_probe_sender.py` 并自检通过；A/B 已实测响应，C 待恢复后补测。三节点 60 分钟混合负载和 `LIVE` 门禁仍未完成。
- A/B 闭环查询成功，但 RTCM 门禁未过：160 B 分片下 A 收到 57-58/100、B 收到 64/100；96 B 分片下 A 收到 58/128。CRC/reject 为 0，但有重组超时，说明当前主要约束是无线包率/调度而不是 UART 总字节。
- 2026-07-27 分级真机测试已定位空口边界：A 的 90 B 单帧在 7.5 Hz 为 90/90，通过；8 Hz 为 80/96，失败。160 B 单帧在 4 Hz 为 48/48，通过；5 Hz 为 59/60，失败；250 B 单帧在 6 Hz 仅 19/72。限制同时受包率和帧长影响，不能用 115200 UART 占用或大包批处理替代真机门禁。
- 和芯星通 UM220-IV NK 官方产品页确认其支持 GPS L1、BDS B1、Galileo E1 和 QZSS，不支持 GLONASS。新增 `um220-shaped` 候选：丢弃无效的 RTCM 1084、1124 仅保留最新 1 Hz，并以 160 ms 最小包间隔平滑发送；保留 1005/1033、1074/1094/1114/1124。
- A 节点 `um220-shaped` 已先通过 12 s，再通过 60 s 严格 PROBE：312/312 分片、252/252 完整帧、32400/32400 RTCM 字节，CRC/重组/队列/注入错误均为 0；净 RTCM 540 B/s、field-link 852 B/s、0 次调度迟到、最大迟到 4.365 ms。测试后网关恢复 active。
- B 恢复后健康快照确认身份和遥测在线，但控制响应慢于原 3 s 查询窗口，闭环改用 6 s/5 次重试。四星座 profile 的 12 s 为 63/63、51/51，通过；60 s 为 310/312、250/252，失败；180 ms 复测降至 304/312、244/252 且出现重组超时/队列淘汰，证明拉长包间隔本身不能消除 B 的空口波动。
- 2026-07-27 对 QZSS 1114 降到 0.5 Hz 做了三组隔离：`160 B/160 ms` 的 60 s 为 280/282 分片、220/222 帧且有 2 次队列淘汰；`160 B/200 ms` 为 280/282、220/222，队列淘汰消失但出现重组超时；`320 B/200 ms` 将 1124 合并为单个 field-link 包，12 s 为 44/44 且通过，60 s 仍为 221/222。它把线上负载降到约 717 B/s，并证明减少包率有效，但 B 仍有低频链路丢包，因此 0.5 Hz QZSS 只保留为实验档，不能进入共同生产配置。
- 共同生产候选默认关闭可选 QZSS 1114，保留 GPS 1074、BDS 1124、Galileo 1094 和 1005/1033。B 在 160 ms 下 60 s 严格通过：252/252 分片、192/192 帧、27000/27000 B，全部异常计数为 0；净 RTCM 450 B/s、field-link 702 B/s。A 已通过包含该负载及额外 QZSS 的严格超集。当前 A/B 在线、C 离线，C 的完整容量预留保持不变。
- field-gateway 已新增未启用的生产核心 `rtcm-downlink-shaper.ts`：有界 RTCM3 流解析/CRC、UM220 支持集白名单、per-type newest-only、1 Hz 观测限频、观测/参考 TTL、过期淘汰和可审计计数。14 项 field-gateway 测试、TypeScript build/lint 全通过；尚未接 NTRIP、串口调度或 LIVE，不会与现有命令/compact 轮询争用端口。
- 针对 B 的低频丢包已实现并烧录 PROBE stats V2：RK2206 队列由 2 增至 4（新增约 2058 B 静态帧区），统计 6 类 RTCM 完整帧和 field-link 有效帧/RTCM 帧/解码错误/序号缺口、重复、重启及 RX FIFO 丢弃；Python 与 TypeScript 均兼容 V1/V2，发布门禁可强制要求 V2。C99 主机测试、Python 自检、field-gateway 15 项测试/lint 和 A 节点 `DISABLED/PROBE/LIVE` 全量交叉编译通过；现场结果见后续条目。
- A/B 已刷入 V2 并分别通过 12 s 三核心星座（50/50 分片、38/38 帧、5360/5360 B）。共享总线的全局 sequence gap/duplicate/reset 会混合独立发送者序号空间，已降为信息型诊断；RTCM 精确计数、按类型计数、decode/FIFO/CRC/重组/队列错误仍为硬门禁。
- 后续 60 s 复测在当前链路条件下真实失败：`128 B/0 ms` 时 A 为 200/252 分片、140/192 帧，B 为 249/252、189/192；`320 B` 大包在 A 的 12 s 仅 28/38。参数调优不能提供生产可靠性，必须加入确认与补发。
- 已实现 24 B `G3A` ACK V1：返回会话、最高序号和最近 16 帧完成位图，RK3568 按 1 s 窗口只补发缺失序列，复用 RK2206 现有 16 帧完成缓存。C99 主机测试、Python 自检、field-gateway 16 项测试/lint，以及 A 的 `DISABLED/PROBE/LIVE` 三模式全量构建均通过；固件标记为 `fw-gnss-rtk-v31-probe-ack-v1-20260728`。ACK V1 包尚未实际烧录，不能声称选择性补发已通过现场门禁。
- ACK V1 的 A/B/C 独立发布包已生成到 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_ack_v1_20260728`，源提交为 `a43318206a84f09841517a9d5f3a2ae7c5d1ac95`。9/9 文件哈希复算匹配；A/B/C `Firmware.img` SHA-256 分别为 `1c60b42ccfdc0f90f30f576cfe7236cf911577734f5dfa1ddf5db56fbafcc79d`、`6cd2b71edc3219c28f5c6b9a8b85ebf67c32ed0edd4c658beefcff29639bec29`、`9ef0916d85a27a4743e4a5b99b8954aceb8c0733b15c9bbcec425943204679a6`。匹配探针已部署到 RK3568 `/usr/local/bin/xls1_gnss_v31_probe_sender.py`，SHA-256 为 `6f0e5a866a0de337aa6379b583cad1e8cc71509f2acb39213deb7f890056b1e4`，板端自检通过。
- 2026-07-28 用户报告完成烧录并上电后，RK3568 闭环发现 A/B 均能返回 V2 `PROBE` 统计，但在三核心星座 12 s 选择性补发的第一个窗口中，`G3A` ACK 连续 3 次、每次 1 s 均无响应。随后绕过门禁直接抓取 A/B 各 6 s，控制响应数均为 0 且 RK3568 解码错误为 0；ACK 查询后 A 的非选择性 1 s 门禁仍以 4/4 分片、3/3 帧、430/430 B 通过，排除了 DataProcessTask 被 ACK 处理锁死。Windows 最近文件记录随后确认 18:56-18:58 实际打开的是旧 `xl01_gnss_rtk_v31_probe_stats_v2_20260727\A/B/C`，而 ACK V1 包在 19:54-19:55 才生成；所以当前节点确定仍是旧 V2，不属于 ACK V1 真机实现故障。
- 同次基线确认 A/B 在线、C 仅为 `configured`；RK3568 系统时间仍显示 2026-07-27，落后当前项目日期。合成 PROBE 的恢复时延和调度迟到使用单调时钟，不因此失效，但在真实 NTRIP、correction age、日志和跨设备存储门禁前必须恢复可信 NTP/RTC 时间。
- V2 源提交 `c0eff2a3` 已推送；A/B/C 独立全量构建的只读发布包位于 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_stats_v2_20260727`。9/9 二进制 SHA-256 复算匹配，A/B/C `Firmware.img` 分别为 `2f5995a3...cb15c`、`7a4d86d5...a3777`、`cee103b9...2be54`，节点身份均只命中自身，三份 loader 一致。该 V2 包是当前 A/B 实际运行版本；ACK V1 待重新烧录。
- 容量工具已支持 `active=2 + reserved=1`。按历史 881.84 B/s RTCM 数据，A/B 活跃估算为 1768.08 B/s（15.35% UART），C 完整预留 180 B/s，三节点总预算仍为 1948.08 B/s（16.91% UART）。历史 compact 三节点曾连续完成 541/541 批次、1623/1623 遥测，证明 compact 时隙可行，但不代表 RTCM 已通过。
- 早期 `GNSS_CORE` 设计为 98 字节独立摘要；自 `49eb7544` 起，常规上行改为 95 字节 `compact v3` 单快照，不再另发高频 GNSS 包。原始 NMEA/逐星明细仍不连续上传，专业 ECEF/ENU/Hampel/Kalman 位移链继续统一由 RK3568 计算。
- 生产硬件真值已按远端源码和用户确认纠正：每节点为 UM220-IV NK、RS-ECTH-N01-TR-1 三合一土壤探头、RS-DIP-N01-1 三轴倾角计；SHT30/MPU6050 是关闭的遗留样例驱动，雨量型号未确认且关闭。三合一探头在诊断中分为温湿度基础寄存器和 EC 独立寄存器两条路径，但仍是一个物理探头。
- `ed803b0e` 已实现 204 B `G3S` V3：保留 V1/V2 前缀并追加 4 条实际采集路径的 enabled/init/current/ever 位、采集周期数、最后成功单调 uptime 和连续失败数。RS485 init 位只证明 SC16IS752/Modbus 路径初始化，不伪称探头应答；终端健康由 valid/ever/fail streak 判断。C99、Python 自检、field-gateway 17 项测试/lint和 A 完整 `hb build -f` 均通过。
- A/B/C 诊断固件发布包位于 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_sensor_diag_v3_20260729`，manifest 源提交为 `ed803b0e9d74a62ca8901428919c5a93f2969edb`，9/9 哈希复算匹配、节点身份唯一、loader 一致。A/B/C `Firmware.img` SHA-256 分别为 `363bb6841354d6aa92fab4e006b1b018f838bc190d1e5888d3a6c36f5b0e1c00`、`ad5080526d443ad4095a7592466953ee88cb7dea7374584e13ce622f2136d7f3`、`7a768f53b4f4161b4582c3f7059b07512b68fff63e401ec9b55031750b78611e`。包仍是 PROBE，绝不写 UM220 RTCM UART。
- 现场脚本新增 `--diagnostics-only --require-stats-version 3`，只做定向查询、不发送 RTCM，并分开报告 `linkOnline=true`、`telemetryOnline=null` 与 `sensorDegraded`，不会把控制响应伪装成遥测在线。累计 ACK 调度器代码已提交但 60 秒现场门禁尚未完成，不能标记为生产通过。
- 提交 `b9fc4d64` 的现场脚本已部署到 RK3568 `/usr/local/bin/xls1_gnss_v31_probe_sender.py`，本地/板端 SHA-256 均为 `189f1e65e00428ca14055a26c72378ad6d880f28c807dbd905065c2151705ef6`，Python 3.10 自检通过，`lsmv2-field-gateway.service` 保持 `active`。旧固件尚不支持 G3S V3，因此部署后没有提前查询，等待统一烧录。
- 2026-07-29 用户完成 V3 诊断包烧录并上电后的真机复核：A 返回 `version=3 mode=1`，`enabled/init=0x0F`、`current/ever=0x0E`，RS-ECTH 基础、EC 和 RS-DIP 均连续有效，只有室内 UM220 暂无有效定位；普通 compact 遥测恢复为 online。C 同样返回 `version=3 mode=1`，证明新固件和 XLS1 双向控制链生效，但两次查询均为 `current/ever=0x00`，第二次四条路径 `samples=126`、`fail_streak=126`、`last_ok=0`，证明采集任务在运行而 UM220、RS-ECTH 基础/EC、RS-DIP 从未获得一次有效数据。A 的同固件对照排除共性固件故障，C 应优先检查共同供电/GND、J6/J7、RS485 A/B 极性和板端 SC16IS752/隔离收发器，并用 A 的已知良好传感器线束交叉验证。B 连续 5 次定向查询无响应且无普通遥测，当前固件身份未能确认，按链路离线处理。
- 诊断结束后 RK3568 的 field-gateway 已恢复 `active`，`/dev/ttyS3` 和 MQTT 正常；A 遥测新鲜，B/C 仍无 compact 遥测，`schemaRejected=0`、`rejectedWriteFailures=0`、`interleavingSuspected=0`。板端系统日期仍错误，报告文件名中的 2026-07-26 不作为真实采集时间证据。
- 后续统一重刷 V3 并上电后的最终对照修正了“B 离线”旧状态：A 为 `current/ever=0x0E`，土壤基础、EC、倾角正常；B 控制链在线但连续 47 个采集周期所有路径 `current/ever=0`；C 控制链在线但连续 53 个采集周期所有路径 `current/ever=0`。RK3568 同期无 schema reject、串口写失败或交织错误。停止 field-gateway 35 秒时 RK2206 采集计数仍增长而 B/C `ever=0`，因此不是 RK3568 丢弃已生成的传感器数据。
- 换位证据进一步分离了故障域：B 核心板放到 C 位置时能读取土壤基础/EC，回原 B 位置后全失败，说明 B 固件/核心板可工作而 B 位置的供电、线束、隔离收发器或探头链可疑；C 核心板即使烧录 A 固件仍全失败，而真正的 A/B 核心板在 C 位置能读取土壤，说明身份固件和 XLS1 配对不是 C 无数据原因，C 核心板/U4/焊接接触仍可疑。C 位置倾角链始终失败，是独立外部链故障候选。
- `b8cdd26c` 已实现向后兼容的 384 B `G3S` V4。前 204 B 完整保留 V3；追加 U4 实际 I2C 地址、双通道 scratchpad/内部 loopback/UART 初始化状态，双通道 Modbus 写/TX/I2C读/无响应/短帧/地址/CRC/异常/功能码/字节数分类计数，以及只读有界扫描。扫描只对地址 1 发 `0x03/0x04` 读请求，覆盖双通道、4800/9600 和 1.8432/14.7456 MHz 假设，最坏约 15 秒并逐次喂狗；结束后恢复 1.8432 MHz、4800 8N1。查询组合命中不等于传感器型号识别。
- 构建脚本已补齐此前遗漏的 `field_sensors_rs485`、`rs485_modbus` 和 `sc16is752_driver` 六个源/头文件同步，避免仓库修改未进入 OpenHarmony SDK。C99 主机测试、Python 自检、field-gateway 18 项测试/lint、节点 A 预构建及正式 A/B/C 三次 `hb build -f` 全部通过。
- V4 A/B/C 正式 PROBE 包位于 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_sensor_diag_v4_20260729`，manifest 来源为 `b8cdd26c9f4706dc5937c09a6d4ffd72dbd60ab3`。9/9 二进制独立复算匹配、节点 UUID/安装标签唯一、三份 loader SHA-256 同为 `761d90888aa376156d562abf267dfe324b96c4397f7a601f6b4c64d0ea3bf977`；A/B/C `Firmware.img` SHA-256 分别为 `8093162cf3a0ce3a748b8b96d4d2948034bbc65f5b25ebaea45a89b9b91f2b91`、`6c02590545153da68b909a2cea8e094a3c02023e12748e347bb130228160be52`、`7dec8c46f17c370a52459dd128c83a5c128b34121e171a071b6b64cb10243d23`。该包仍为 PROBE，不向 UM220 写 RTCM。
- 向后兼容 V4 的查询脚本已部署到 RK3568 `/usr/local/bin/xls1_gnss_v31_probe_sender.py`，本地/板端 SHA-256 均为 `3963c1f263b2a4ca44ed9ee796ae06ad487395971a2c94aaa834831c0daacd41`，Python 3.10 自检通过。
- 2026-07-29 用户统一烧录 V4 并上电后，RK3568 按 A -> B -> C 完成定向只读诊断。A 为健康对照：U4 在 `0x4D`，init、双通道 scratchpad、内部 loopback 和 UART 初始化均为 0，loopback 各回收 4 字节，空闲 `LSR=0x60`；扫描 2/2 命中两个配置查询形状，双通道累计收到 1401/935 字节，土壤基础、EC 和倾角当前均有效，只有室内 GNSS 无有效定位。
- B/C 的节点身份和 XLS1 双向控制链均在线，但呈现相同 U4 异常：`0x4D` 可应答、init 和 UART 初始化记为 0，双通道 scratchpad 均为 `-2`（写入测试值后读回不一致），内部 loopback 均为 `-2`（FIFO 未能写入完整测试字节），`LSR=0x00`。各自 48 个只读扫描组合全部失败；B 两通道 76/76 个请求、C 两通道约 84/84 个请求均在 U4 UART 写阶段失败，RX 字节为 0，尚未到 RS485 总线等待传感器响应的阶段。因此当前不能把 B/C 归因于探头、A/B 极性或寄存器配置，首要故障域是 U4 模块本体/版本/晶振、3.3 V 供电、插座接触或主板 I2C 路径。
- 随后的 RK2206 核心板交叉试验进一步定位 B：A 核心板移到 B 位置后连续两次仍为 U4 全自检通过、`LSR=0x60`，且土壤基础、EC、倾角均有效；原 B 核心板移到已知正常的 A 位置后仍稳定复现 scratchpad/loopback `[-2,-2]`、`LSR=0x00`、扫描零命中和 U4 UART 写失败。故障明确随 B 核心板移动，排除 A/B 两处位置侧 U4、RS485、线束和探头，优先检查或更换 B 核心板的 EI2C0_M0 PB4/PB5、排针/焊点及板载 3.3 V/I2C 电气路径。该结论以交叉时仅移动 RK2206 核心板、位置侧载板和外设不随动为前提。
- C 核心板随后也移到已知正常的 A 位置，仍复现双通道 scratchpad/loopback `[-2,-2]`、`LSR=0x00`、48 个扫描组合零命中和全部 U4 UART 写失败；因此 C 故障同样跟随核心板。最终交叉矩阵为：A 核心板在 B 位置正常，B/C 核心板在 A 位置均异常。B/C 进入相同的 PB4/PB5、排针/焊点、I2C 电气路径检查或换板流程，位置侧 U4、RS485 和探头暂不更换。
- 交叉试验结束后 A 核心板已放回 A 位置并再次通过 V4：U4 全自检为 0、`LSR=0x60`，土壤基础/EC/倾角当前均有效，证明换位过程未损坏 A 基准链。倾角累计 74 次请求中有 5 次无响应但当前有效、CRC/帧错误为 0，保留为后续长测观察项；室内 GNSS 无定位是整体 `sensor_degraded=true` 的原因，不代表 RS485 回归失败。
- 生产 ClickHouse 的历史数据修正了“B 核心板永久损坏”的过强判断。C 的土壤/EC/倾角最后记录为 2026-07-26 19:02:59 UTC，之后到 7 月 29 日仅有 GPS；B 在该时刻后仍有 128793 条土壤基础、128769 条 EC 和 125587 组倾角记录，土壤温度包含 38 个不同值，三轴倾角持续变化，倾角到 7 月 29 日 11:20:22 UTC、土壤/EC 到 14:03:38 UTC。B 的 U4/双通道确实在 C 故障后长期工作过，当前失败应表述为“在现有 V4/插接状态下随 B 核心板复现”，候选包括近期排针/接触/电气变化和版本相关启动行为，不能直接判定永久坏引脚。湿度和 EC 在 C 停止后的 B 记录均为 0，仍需在恢复后单独验证探头读数合理性。
- 稳定 compact 提交 `6d448134` 到 V3 `ed803b0e` 之间，`sc16is752_driver.c`、`rs485_modbus.c`、`field_sensors_rs485.c` 无源码变化；V3 的 U4 读写路径与稳定版本相同。V4 `b8cdd26c` 才增加启动 scratchpad/loopback 和只读扫描，但 B 的倾角及土壤停止时间早于 V4 正式包生成，因此现有证据既不支持 RK3568 丢弃本地传感器数据，也不足以把根因单独归到 V4。
- A 核心板后来插到 C 位置时，`target=A` 和 `target=C` 均连续无响应，网关普通 compact 接收数从 1 降为 0；该状态尚未进入传感器诊断层，说明当前 C 位置还存在 XLS1/TTL、供电或插接链路问题，不能用这轮试验判断 C 位置传感器。
- 2026-07-30 用户补充了关键物理条件：此前 A 恢复在线是因为把 XLS1 天线接回 A，随后同一根天线移到 C，A 核心板也放到 C。RK3568 网关仍持续每秒写轮询，但健康快照从 `2026-07-25T20:00:11.478Z` 起再无串口读入，`serialBytes=11264`、`telemetryMessages=176` 停止增长，三节点均无新帧且 schema/interleaving/write 错误为 0。绕过网关对固件身份 A 做 3 次、每次 4 秒的 V4 定向查询也无响应，网关随后自动恢复 `active`、`NRestarts=0`。因此这次 A-on-C 试验首先定位 C 位置的 XLS1 天线接口/供电、XLS1 持久参数、XLS1 发射链或 `XLS1 <-> RK2206` TTL 组/波特率/TX-RX/GND；不能归因于 RK3568 丢弃帧，也不能进入 U4/传感器诊断层。
- 三次查询后 `lsmv2-field-gateway.service` 已恢复 `active/running`，`NRestarts=0`。本记录不保存现场原始日志、真实坐标或凭据；RK3568 错误系统日期生成的报告文件名不作为时间证据。

## Constraints

- 现有链路为 RK3568 -> DL-XLS1/XL01 共享 115200 串口 -> 3 个 RK2206 -> 3 个 UM220-IV NK。
- RTCM 必须保持原始二进制，不能 JSON/Base64 包装。
- 不能在 memory、日志或 Git 中保存 NTRIP 主机、账号、密码和真实坐标。
- UM220-IV NK 按 rover 使用，不依赖其输出基站 RTCM。
- `LIVE` 固件必须等待单节点 `PROBE` 和三节点混合负载验收；编译成功不能替代现场证据。
- RK2206/南向协议使用纳度/毫米定点整数；RK3568/API 使用 `double`、至少 9 位小数，并保留 GNSS 历元、质量、差分龄、GST/DOP、基站号和 Fixed 连续性。

## Plan

1. 部署匹配网关但保持 `NTRIP_ENABLED=false`、runtime probe、聚合数 1。
2. 三节点烧录后按“普通遥测 -> legacy G3R PROBE -> G3B/2 PROBE -> 1 Hz LIVE 600 s
   -> 1800 s”推进；任一阶段失败立即恢复 fail-closed。
3. C 若继续 GGA=5，独立调整其天线和接收环境；不得以降低三节点共同 cadence 或放宽
   correction-age/GST 门槛冒充系统通过。

## Open Questions

- correction age 约 `10 s` 是真实修正新鲜度、共享链路调度延迟、节点时间戳口径，
  还是 UM220 GGA age 字段解析/更新节奏造成？必须用节点端完成/注入时间和接收机输出对齐验证。
- G3B 聚合数 2 能否在双观测组 1 Hz 的 600/1800 秒长测中同时保持普通遥测零丢失、
  三节点 Fixed 连续性、age/GST 门禁和旧队列隔离？
- C 在收到不少于 A/B 的修正片段时仍为 GGA=5，调整其天线位置和局部接收环境后能否
  与 A/B 同时持续 GGA=4？
- RK2206 无可信绝对 Unix 时钟时，是否接受网关绝对 TTL + 节点单调队列龄的双层策略，或需要补充可信时间同步？
- 单条修正流供同一现场 3 台 rover 使用是否满足服务商授权与空间范围？

## Done When

- 3 节点 60 分钟真实混合负载满足 correction age、Fixed 连续性、CRC、队列、旧 session 和命令延迟门槛。
- 定点 `GNSS_CORE`、RK3568 专业位移算法、可追溯存储和生产/比赛配置均通过测试。
- RK2206 新增 GNSS RAM/CPU、RK3568 增量 RSS/CPU 和链路占用有实测报告且满足预算。
