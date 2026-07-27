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
- 主机测试、field-gateway 10 项回归/lint 及 `DISABLED/PROBE/LIVE` 三模式固件交叉编译均通过。2026-07-27 A/B 已确认运行新 `PROBE-stats` 固件并在线；C 当前无法上线，只保留配置和容量，不生成虚假遥测。
- 已实现 RK3568-only 闭环计数：RK3568 以定向 nonce 查询节点，RK2206 在任务上下文通过 `control=4` 回传固定 92 字节统计快照；发送器以前后快照的 uint32 差值自动核对 accepted/completed/PROBE/bytes、队列、CRC 和注入错误。该路径不使用 PC 调试 UART，且 `PROBE` 不写 UM220。
- RK3568 旧发送器已向 A 发送 12 s 的 `32B/15ms` 基线（76 帧/100 分片）且网关自动恢复，但旧固件不能回传计数，所以该结果仍不是硬件门禁通过。
- 新 A/B/C `PROBE-stats` 包已由提交 `50c3ec3b` 独立全量构建到 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_stats_20260727`，9 个二进制哈希、三节点身份、固件标记和 PROBE 模式均通过复核。闭环发送器已部署到 RK3568 `/usr/local/bin/xls1_gnss_v31_probe_sender.py` 并自检通过；A/B 已实测响应，C 待恢复后补测。三节点 60 分钟混合负载和 `LIVE` 门禁仍未完成。
- A/B 闭环查询成功，但 RTCM 门禁未过：160 B 分片下 A 收到 57-58/100、B 收到 64/100；96 B 分片下 A 收到 58/128。CRC/reject 为 0，但有重组超时，说明当前主要约束是无线包率/调度而不是 UART 总字节。
- 2026-07-27 分级真机测试已定位空口边界：A 的 90 B 单帧在 7.5 Hz 为 90/90，通过；8 Hz 为 80/96，失败。160 B 单帧在 4 Hz 为 48/48，通过；5 Hz 为 59/60，失败；250 B 单帧在 6 Hz 仅 19/72。限制同时受包率和帧长影响，不能用 115200 UART 占用或大包批处理替代真机门禁。
- 和芯星通 UM220-IV NK 官方产品页确认其支持 GPS L1、BDS B1、Galileo E1 和 QZSS，不支持 GLONASS。新增 `um220-shaped` 候选：丢弃无效的 RTCM 1084、1124 仅保留最新 1 Hz，并以 160 ms 最小包间隔平滑发送；保留 1005/1033、1074/1094/1114/1124。
- A 节点 `um220-shaped` 已先通过 12 s，再通过 60 s 严格 PROBE：312/312 分片、252/252 完整帧、32400/32400 RTCM 字节，CRC/重组/队列/注入错误均为 0；净 RTCM 540 B/s、field-link 852 B/s、0 次调度迟到、最大迟到 4.365 ms。测试后网关恢复 active。
- B 恢复后健康快照确认身份和遥测在线，但控制响应慢于原 3 s 查询窗口，闭环改用 6 s/5 次重试。四星座 profile 的 12 s 为 63/63、51/51，通过；60 s 为 310/312、250/252，失败；180 ms 复测降至 304/312、244/252 且出现重组超时/队列淘汰，证明拉长包间隔本身不能消除 B 的空口波动。
- 共同生产候选默认关闭可选 QZSS 1114，保留 GPS 1074、BDS 1124、Galileo 1094 和 1005/1033。B 在 160 ms 下 60 s 严格通过：252/252 分片、192/192 帧、27000/27000 B，全部异常计数为 0；净 RTCM 450 B/s、field-link 702 B/s。A 已通过包含该负载及额外 QZSS 的严格超集。当前 A/B 在线、C 离线，C 的完整容量预留保持不变。
- field-gateway 已新增未启用的生产核心 `rtcm-downlink-shaper.ts`：有界 RTCM3 流解析/CRC、UM220 支持集白名单、per-type newest-only、1 Hz 观测限频、观测/参考 TTL、过期淘汰和可审计计数。14 项 field-gateway 测试、TypeScript build/lint 全通过；尚未接 NTRIP、串口调度或 LIVE，不会与现有命令/compact 轮询争用端口。
- 容量工具已支持 `active=2 + reserved=1`。按历史 881.84 B/s RTCM 数据，A/B 活跃估算为 1768.08 B/s（15.35% UART），C 完整预留 180 B/s，三节点总预算仍为 1948.08 B/s（16.91% UART）。历史 compact 三节点曾连续完成 541/541 批次、1623/1623 遥测，证明 compact 时隙可行，但不代表 RTCM 已通过。
- GNSS 常规链路采用 98 字节核心摘要，不连续上传原始 NMEA/逐星明细；专业 ECEF/ENU/Hampel/Kalman 位移链统一由 RK3568 计算。

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
- A/B 节点计数均通过后，再加入 3 个 1 Hz `GNSS_CORE`、compact 环境遥测和控制命令，执行真实 NTRIP 混合负载；不把合成 PROBE 通过等同于 RTK Fixed 通过。
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
