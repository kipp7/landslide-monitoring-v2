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
- GNSS 常规链路采用 98 字节核心摘要，不连续上传原始 NMEA/逐星明细；专业 ECEF/ENU/Hampel/Kalman 位移链统一由 RK3568 计算。
- 生产硬件真值已按远端源码和用户确认纠正：每节点为 UM220-IV NK、RS-ECTH-N01-TR-1 三合一土壤探头、RS-DIP-N01-1 三轴倾角计；SHT30/MPU6050 是关闭的遗留样例驱动，雨量型号未确认且关闭。三合一探头在诊断中分为温湿度基础寄存器和 EC 独立寄存器两条路径，但仍是一个物理探头。
- `ed803b0e` 已实现 204 B `G3S` V3：保留 V1/V2 前缀并追加 4 条实际采集路径的 enabled/init/current/ever 位、采集周期数、最后成功单调 uptime 和连续失败数。RS485 init 位只证明 SC16IS752/Modbus 路径初始化，不伪称探头应答；终端健康由 valid/ever/fail streak 判断。C99、Python 自检、field-gateway 17 项测试/lint和 A 完整 `hb build -f` 均通过。
- A/B/C 诊断固件发布包位于 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_sensor_diag_v3_20260729`，manifest 源提交为 `ed803b0e9d74a62ca8901428919c5a93f2969edb`，9/9 哈希复算匹配、节点身份唯一、loader 一致。A/B/C `Firmware.img` SHA-256 分别为 `363bb6841354d6aa92fab4e006b1b018f838bc190d1e5888d3a6c36f5b0e1c00`、`ad5080526d443ad4095a7592466953ee88cb7dea7374584e13ce622f2136d7f3`、`7a768f53b4f4161b4582c3f7059b07512b68fff63e401ec9b55031750b78611e`。包仍是 PROBE，绝不写 UM220 RTCM UART。
- 现场脚本新增 `--diagnostics-only --require-stats-version 3`，只做定向查询、不发送 RTCM，并分开报告 `linkOnline=true`、`telemetryOnline=null` 与 `sensorDegraded`，不会把控制响应伪装成遥测在线。累计 ACK 调度器代码已提交但 60 秒现场门禁尚未完成，不能标记为生产通过。
- 提交 `b9fc4d64` 的现场脚本已部署到 RK3568 `/usr/local/bin/xls1_gnss_v31_probe_sender.py`，本地/板端 SHA-256 均为 `189f1e65e00428ca14055a26c72378ad6d880f28c807dbd905065c2151705ef6`，Python 3.10 自检通过，`lsmv2-field-gateway.service` 保持 `active`。旧固件尚不支持 G3S V3，因此部署后没有提前查询，等待统一烧录。
- 2026-07-29 用户完成 V3 诊断包烧录并上电后的真机复核：A 返回 `version=3 mode=1`，`enabled/init=0x0F`、`current/ever=0x0E`，RS-ECTH 基础、EC 和 RS-DIP 均连续有效，只有室内 UM220 暂无有效定位；普通 compact 遥测恢复为 online。C 同样返回 `version=3 mode=1`，证明新固件和 XLS1 双向控制链生效，但两次查询均为 `current/ever=0x00`，第二次四条路径 `samples=126`、`fail_streak=126`、`last_ok=0`，证明采集任务在运行而 UM220、RS-ECTH 基础/EC、RS-DIP 从未获得一次有效数据。A 的同固件对照排除共性固件故障，C 应优先检查共同供电/GND、J6/J7、RS485 A/B 极性和板端 SC16IS752/隔离收发器，并用 A 的已知良好传感器线束交叉验证。B 连续 5 次定向查询无响应且无普通遥测，当前固件身份未能确认，按链路离线处理。
- 诊断结束后 RK3568 的 field-gateway 已恢复 `active`，`/dev/ttyS3` 和 MQTT 正常；A 遥测新鲜，B/C 仍无 compact 遥测，`schemaRejected=0`、`rejectedWriteFailures=0`、`interleavingSuspected=0`。板端系统日期仍错误，报告文件名中的 2026-07-26 不作为真实采集时间证据。

## Constraints

- 现有链路为 RK3568 -> DL-XLS1/XL01 共享 115200 串口 -> 3 个 RK2206 -> 3 个 UM220-IV NK。
- RTCM 必须保持原始二进制，不能 JSON/Base64 包装。
- 不能在 memory、日志或 Git 中保存 NTRIP 主机、账号、密码和真实坐标。
- UM220-IV NK 按 rover 使用，不依赖其输出基站 RTCM。
- `LIVE` 固件必须等待单节点 `PROBE` 和三节点混合负载验收；编译成功不能替代现场证据。
- RK2206/南向协议使用纳度/毫米定点整数；RK3568/API 使用 `double`、至少 9 位小数，并保留 GNSS 历元、质量、差分龄、GST/DOP、基站号和 Fixed 连续性。

## Plan

- 捕获至少 60 s 无凭据原始 RTCM，运行 capture-driven 容量报告。
- 保持 C 显式不可用且预留 180 B/s；C 恢复后以三核心星座 `um220-shaped` profile 执行 12 s 和 60 s PROBE。
- 将已实现的 RTCM shaper 接入 RK3568 统一端口所有权调度器，补齐 160 B 分片、160 ms 包间隔、持久 session epoch、绝对 TTL 和运行状态；队列过载时丢弃旧改正数而不是延迟发送。
- 在恢复 QZSS 前设计并门禁低频累计确认/选择性重传或等价的有界可靠机制；不能用无限队列、逐帧三节点 ACK 或盲目全量重复换取表面零丢包。机制必须保持 correction age 有界，并实测三节点反向确认不会与 compact 遥测争用半双工链路。
- A/B 节点计数均通过后，再加入 3 个 1 Hz `GNSS_CORE`、compact 环境遥测和控制命令，执行真实 NTRIP 混合负载；不把合成 PROBE 通过等同于 RTK Fixed 通过。
- 暂停累计 ACK 和 12 s/60 s RTCM 门禁。先用 A 的已知良好 RS-ECTH、RS-DIP 及线束在 C 上做交叉验证；若 C 仍为 `ever=0`，检查 C 的共同供电/GND、J6/J7、A/B 极性及 SC16IS752/隔离收发器。并单独恢复 B 供电/无线链路，直到 B 可返回 V3 诊断且普通遥测在线。三节点传感器路径恢复前保持 `LIVE` 关闭。
- 至少运行 60 分钟三节点门禁，目标 correction age P95 <=3 s、max <=5 s、无旧 session 注入且 Fixed 连续。
- 通过后才启用 `LIVE`，随后实现定点 GNSS 解析、RK3568 ECEF/ENU/Hampel/Kalman、服务器 CEEMDAN 和 UI/profile。

## Open Questions

- A/B 已通过的 450 B/s 共同候选在 C 和真实 RTCM、三节点上行混合负载下，空口广播行为、Fixed 连续性和旧队列风险是否仍满足门禁？
- RK2206 无可信绝对 Unix 时钟时，是否接受网关绝对 TTL + 节点单调队列龄的双层策略，或需要补充可信时间同步？
- 单条修正流供同一现场 3 台 rover 使用是否满足服务商授权与空间范围？

## Done When

- 3 节点 60 分钟真实混合负载满足 correction age、Fixed 连续性、CRC、队列、旧 session 和命令延迟门槛。
- 定点 `GNSS_CORE`、RK3568 专业位移算法、可追溯存储和生产/比赛配置均通过测试。
- RK2206 新增 GNSS RAM/CPU、RK3568 增量 RSS/CPU 和链路占用有实测报告且满足预算。
