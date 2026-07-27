---
title: gnss-rtk-v3-transport-gate-20260726
type: checkpoint
tags:
  - checkpoint
  - gnss
  - rtk
  - xls1
  - transport
status: active
---

# Checkpoint: gnss-rtk-v3-transport-gate-20260726

## Objective

在不更换 UM220-IV NK、BT-760 和 DL-XLS1/XL01 的前提下，先证明 RK3568 到 3 个 RK2206 的 RTCM 与精密 GNSS 数据链稳定、及时、可追溯，再进入 ECEF/ENU、Hampel/Kalman、服务器 CEEMDAN 和比赛界面。

## Last Confirmed State

- PC 开阔测试已证明 UM220-IV NK + BT-760 + CORS 能进入并保持 RTK Fixed；当前不以更换接收机解决共享链路问题。
- `4ed2ce5b` 已冻结 V3.1 二进制协议：外层保留 `cobs-crc-v1`，新增 `gnss-core=5`、`rtcm=6`，带 session epoch、sequence、生成时间、TTL、目标掩码、有界分片和 CRC24Q。
- `GNSS_CORE` 为 98 字节结构化核心摘要，约 116 字节线上帧；3 节点 1 Hz 约 348 B/s。常规链路不上传原始 NMEA、逐星 GSV 或接收机调试输出。专业位移输入保留纳度坐标、毫米高程、GNSS 历元、GGA quality、差分龄、卫星数、DOP/GST、基站号和 Fixed 连续性；ECEF/ENU、Hampel/Kalman 和位移结果统一在 RK3568 计算。
- `e00107ed` 已实现 RK2206 RTCM 运行时边界：XL01 `type=6` 路由、4 个有界重组槽、2 帧新鲜度优先队列、完整帧 CRC24Q、重复/过期/容量/TTL 未核验计数，以及单 GPS 任务串行拥有 GNSS UART。
- 固件模式为 `DISABLED/PROBE/LIVE`，默认 `DISABLED`；`PROBE` 完成接收、重组、CRC 和排队但不写 UM220；互斥锁或节点身份初始化失败时保持关闭。
- C99 `-Wall -Wextra -Werror` 主机测试通过；重组器 5616 B、两帧数据区 2058 B、单帧发送缓冲约 1029 B，静态新增量仍低于 32 KB RK2206 GNSS 预算。
- field-gateway 9 项测试和 lint 通过；RK2206/OpenHarmony 的 `DISABLED`、`PROBE`、`LIVE` 三种 A 节点固件均交叉编译通过。
- 容量工具现可直接读取 PC 测试日志的最终 `RESULT`。2026-07-26 实测摘要为 584.7 s、515609 个有效 RTCM 字节、3608 帧、CRC 错误 0，平均 881.84 B/s；无需为平均容量初筛再次到室外采集。
- 基于上述实测字节量和帧数重建的离线筛选中，160 B RTCM 分片配 `64B/5ms` 的三节点联合估算为 1948.08 B/s、UART 占用 16.91%、RTCM writer duty 20.12%，可进入真机扫参。现有 `32B/15ms` 在 46/96 B 小分片下 writer duty 为 121.47%/78.87%，不能使用；160 B 分片下仍为 66.40%，余量不足，不作为推荐参数。
- 文本汇总日志没有单帧原始长度和到达间隔；报告中的分片开销使用实测总字节/总帧数的均匀平均帧重建。该限制不阻塞离线初筛，但瞬时突发、XLS1 空口吞吐和 FIFO 行为仍必须由 `PROBE` 真机门禁验证。
- 已按历史 RK2206 发布流程完成 A/B/C 三次独立 `hb build -f` 并归档到 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_20260726`。每个节点目录均包含同次构建的 `Firmware.img`、`liteos.bin` 和 `rk2206_db_loader.bin`，根目录包含 `README.txt`、`manifest.json` 和 `SHA256SUMS.txt`。
- 三套 `liteos.bin` 已逐一核验正确 UUID、`FIELD-NODE-A/B/C`、固件标记、sample version 和 `PROBE (no GNSS UART writes)`；9 个二进制的独立 SHA256 复算全部通过。A/B/C 的 `Firmware.img` SHA256 分别为 `0160A08C...857D`、`F4314002...4F32`、`2C4653C4...34E5`，完整值以包内 `SHA256SUMS.txt` 为准。
- 回滚包保留在 `F:\2\openharmony\rk2206_firmware_releases\xl01_one_second_poll_v2_20260719`，未被覆盖。新包装脚本强制拒绝覆盖已有发布目录，并自动校验节点身份和 PROBE 模式。
- 2026-07-26 晚间 A/B/C 已全部刷入上述 `PROBE` 正式包并上电。RK3568 当前地址为 `192.168.124.179`；`lsmv2-field-gateway.service`、`/dev/ttyS3 @ 115200` 和 MQTT 均在线，健康文件确认三个 UUID、`FIELD-NODE-A/B/C` 和在线状态正确，`schemaRejected=0`、`rejectedWriteFailures=0`、`interleavingSuspected=0`。
- 新增 `scripts/field/xls1_gnss_v31_probe_sender.py`，只生成不含凭据/坐标的 CRC24Q 正确 RTCM 流量，支持节点目标掩码、160 B 分片、受控串口节奏、原子报告和 field-gateway 自动停机/恢复。Windows/Python 3.14 与 RK3568/Python 3.10 自检、field-gateway 9 项协议测试和 RK2206 C 主机测试均通过。
- 已在 RK3568 对目标 A 执行 12 s、160 B 分片、`32B/15ms` 基线：发送 76 帧/100 分片、10720 B RTCM、16720 B field-link，最大调度迟到 56.536 ms；报告位于 RK3568 的 `/var/lib/lsmv2/experiments/xls1-gnss-v31-probe-20260726-230247.json`。测试后服务自动恢复，A/B/C 遥测重新在线，网关无协议拒绝、写失败、交织或重连。
- 2026-07-27 已实现 RK3568-only 闭环统计协议：`command=2` 携带 `G3Q + A/B/C + 8 hex nonce`，目标 RK2206 在 DataProcessTask 中取计数快照并以 `control=4` 回传 92 字节 `G3S` 二进制响应。接收回调只入队，不发送；所有模式均可报告自身模式，`PROBE` 路径仍不写 UM220。
- Python 发送器已升级为前后快照门禁，使用 COBS/CRC32 接收解码和 uint32 wrap-safe 差值，严格核对本轮分片、完整帧、排队帧、PROBE 帧/字节，并要求 CRC、拒绝、淘汰、注入和 UART 写入错误为 0。缺少响应或模式不是 PROBE 均直接失败，不再依赖 PC 调试 UART。
- C99 主机测试、Python 3.14 自检、field-gateway 10 项测试/lint，以及 A 节点 `DISABLED/PROBE/LIVE` 三种 OpenHarmony 全量交叉编译均通过。三个模式只做构建证明，未烧录或启用 `LIVE`；共享 SDK 样例已恢复原版本。
- 本 checkpoint 和提交均不包含 CORS 主机、账号、密码、真实坐标或现场原始日志。

## In Progress

- 软件边界、离线容量初筛、旧 A/B/C PROBE 烧录、RK3568 到 A 的发送基线和新闭环统计软件均已完成。当前节点仍是 2026-07-26 旧包，必须先统一刷入待生成的 2026-07-27 PROBE-stats A/B/C 包；在此之前旧固件不会响应统计查询，单节点硬件门禁仍未通过。
- RK2206 当前没有独立可信的 Unix 时钟。节点可执行 1500 ms 重组超时和最多 3000 ms 本地队列龄，但绝对生成时间 TTL 只能计为 `ttl_unverified`，由 RK3568 先做绝对新鲜度过滤。
- 现有 GPS 驱动已阻止 RMC 状态错误设置 Fixed，并公开原始 GGA quality；完整 GGA/GSA/GST/GSV/RMC/ZDA 定点解析和 `GNSS_CORE` 1 Hz 上送尚未实现。

## Next Actions

- 保留本地报告 `docs/reports/xls1-gnss-v31-capacity-20260726.json` 作为可再生证据；原始 RTCM 抓包降为可选精化，不再作为进入单节点 `PROBE` 的阻塞项。
- 从已提交源码生成不覆盖旧包的 `xl01_gnss_rtk_v31_probe_stats_20260727` A/B/C 发布目录，核验各节点 UUID、安装标签、固件标记、PROBE 字符串和 9 个二进制 SHA256，再由用户一次维护操作统一烧录 A/B/C。
- 烧录后无需接电脑调试 UART。SSH RK3568，部署新版发送器并对 A 执行 `32B/15ms`；脚本应自动核对本轮理论值 `accepted=100`、`complete=76`、`probe=76`、`probe_bytes=10720`、`ttl_unverified=100`，以及所有拒绝/CRC/淘汰/注入/写错误为 0。
- A 的 `32B/15ms` 闭环通过后测试 `64B/5ms`，然后按相同方式验证 B/C。不得因为节点在线或 RK3568 写串口成功而跳过节点计数门禁。
- 硬件扫参按 `32B/15ms -> 64B/5ms -> 128B/0ms` 顺序，后一个候选只在前一个没有帧损坏、旧队列或控制延迟时进入。
- 真实门禁负载包含 RTCM、3 个 1 Hz `GNSS_CORE`、compact 环境遥测和控制命令；记录每节点 correction age P50/P95/max、Fixed 连续性、CRC、重组、队列、注入、旧 session 和命令延迟。
- 至少运行 60 分钟；初始通过条件为 correction age P95 <= 3 s、max <= 5 s、没有旧 session 注入且 Fixed 连续。未通过前保持 `LIVE` 关闭。
- 传输通过后再完成 RK2206 定点 GNSS 解析与上送、RK3568 ECEF/ENU/Hampel/Kalman、服务器 CEEMDAN 和 UI/profile 集成。

## Risks

- 115200 只是 MCU-UART 标称值，不能证明 DL-XLS1 的广播、半双工、内部重试和队列吞吐。
- gateway 输入 RTCM CRC 正常不等于节点收到新鲜修正；必须使用节点端完成/注入/TTL 证据。
- RK2206 无可信绝对时钟时，旧模块队列风险不能只依赖节点 TTL；session epoch 必须持久化，网关必须先拒绝过期数据。
- 旧 `PROBE` 已有真机烧录、RK3568 发送和服务恢复证据，但新 PROBE-stats 固件尚未烧录，闭环工具也尚无新固件真机响应；`LIVE` 仍只有可构建证明。不得由编译或发送成功推导单节点 PROBE 通过或厘米级三节点已部署。
- 单 NTRIP 流供 3 台 rover 使用仍需确认服务商授权和同站点空间范围。
- 汇总日志证明平均输入负载，但不能证明 RTCM 单帧尺寸分布或亚秒级突发；不得用 16.91% UART 估算替代 XLS1 节点端完整率和 correction-age 证据。

## Resume Prompt

继续 V3.1 传输门禁：检查分支 `feat/gnss-rtk-v31-transport`、`scripts/field/xls1_gnss_v31_probe_sender.py` 和发布目录 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_stats_20260727`。先确认 A/B/C 是否已统一刷入 PROBE-stats 包；若已刷，直接 SSH RK3568，通过 `/dev/ttyS3` 对 A 运行 12 s `32B/15ms` 闭环门禁，查看报告中的 `hardwareGatePassed` 和前后计数差，不接电脑调试 UART。A 通过后测 `64B/5ms`，随后验证 B/C；不要启用 `LIVE`，不要先实现滤波、CEEMDAN 或 UI。
