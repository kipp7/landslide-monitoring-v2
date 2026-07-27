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
- 源码提交 `50c3ec3becf35a79279ddb0100a621e226c8944a` 已推送并与远端 `feat/gnss-rtk-v31-transport` 一致。基于该提交独立全量构建 A/B/C，发布目录为 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_stats_20260727`；未覆盖 2026-07-26 旧包或回滚包。
- 发布清单固定 `probe`、固件标记 `fw-gnss-rtk-v31-probe-stats-20260727`，9 个二进制独立 SHA256 复算全部匹配。A/B/C `Firmware.img` SHA256 分别为 `263407126151346ce1ac57661c66849adb0ac185a81b4b931dbbe3420b77f941`、`306c60207476524f2de15f00b29bae427482a87df3697d412c313d3e08dd4a55`、`e90103cf03c1bbecd79616a173bc98af1278c03527628f7e5337ad786a470a31`；各节点 liteos 只包含自身 UUID/安装标签，loader 三份哈希一致。
- 新版闭环发送器已部署到 RK3568 `192.168.124.179` 的 `/usr/local/bin/xls1_gnss_v31_probe_sender.py`。RK3568 Python 3.10 自检通过，部署文件与本地 SHA256 一致；四轮门禁后 `lsmv2-field-gateway.service` 均自动恢复为 active。
- 2026-07-27 A/B 已确认运行新 PROBE-stats 并在线，C 无法上线。A/B 闭环统计查询可靠，但四轮 RTCM 门禁均失败：A `160B + 32B/15ms` 为 58/100 分片、43/76 帧；A `160B + 64B/5ms` 为 57/100、41/76；B 同参数为 64/100、47/76；A `96B + 64B/5ms` 为 58/128、28/76。所有运行 CRC/reject/injection/write error 为 0，服务自动恢复。
- 历史三节点 compact 生产证据为 541/541 批次、1623/1623 tag-matched 遥测、0 timeout，平均/最大响应约 509/870 ms。容量模型现显式区分 A/B active 与 C reserve：A/B 1768.08 B/s（15.35% UART），C 预留 180 B/s，合计 1948.08 B/s（16.91%）。该字节余量不能覆盖当前约 5 个完整 field-link 帧/秒的包率边界。
- 新增不改变原混合流默认行为的 `packet-rate` profile 并部署到 RK3568。A 的 90 B 单帧门禁结果为 2/3/4/5/6/7/7.5 Hz 全部无损，8 Hz 仅 80/96；160 B 单帧 4 Hz 为 48/48，5 Hz 为 59/60，6 Hz 为 48/72；120 B/6 Hz 为 61/72，250 B/6 Hz 为 19/72。CRC/reject/injection/write error 始终为 0，证明边界同时受包率和帧长影响。
- UM220-IV NK 官方产品页说明支持 GPS L1、BDS B1、Galileo E1、QZSS，不含 GLONASS。基于该支持集新增 `um220-shaped`：过滤 1084，将 1124 从输入的 2 Hz 限为 newest-only 1 Hz，保留 1005/1033、1074/1094/1114/1124，并以 160 ms 最小包间隔平滑两个 1124 分片及其他帧。
- A 的 `um220-shaped` 先通过 12 s（63/63 分片、51/51 帧），再通过 60 s（312/312 分片、252/252 帧、32400/32400 字节）。该轮净 RTCM 540 B/s、field-link 852 B/s、0 次迟到、最大迟到 4.365 ms、接收解码错误 0，节点端 CRC/重组/队列/注入错误全为 0；服务自动恢复 active。
- B 恢复后健康文件确认 `FIELD-NODE-B` 在线且遥测新鲜，但 PROBE 控制响应需要把查询窗口从 3 s 扩到 6 s。四星座 12 s 为 63/63 分片、51/51 帧并通过；四星座 60 s 为 310/312、250/252，失败；改成 180 ms 后为 304/312、244/252，并新增重组超时和队列淘汰。因此 B 不接受含持续 QZSS 的生产默认负载。
- QZSS 1114 降到 0.5 Hz 后，B 的 `160 B/160 ms` 60 s 仍丢 2/282 分片并触发 2 次队列淘汰；改成 200 ms 后队列压力消失，但仍丢 2/282 且有重组超时。把分片上限改为 320 B 后，250 B 的 1124 从两包变成一包，12 s 44/44 通过，60 s 丢失降到 1/222，线上负载约 717 B/s。该证据说明降低空口包率有效，但不能消除 B 的低频丢包，0.5 Hz QZSS 不得推广到生产。
- 关闭可选 QZSS 1114 后，B 的三核心星座 profile 在 160 ms 下 60 s 严格通过：252/252 分片、192/192 帧、27000/27000 B，CRC/拒绝/重组/队列/注入/UART 错误全为 0。该共同候选为 GPS 1074、BDS 1124、Galileo 1094、1005/1033，净 RTCM 450 B/s、field-link 702 B/s；A 已通过包含它和额外 QZSS 的更高负载。
- field-gateway 新增独立 `rtcm-downlink-shaper.ts` 生产核心和 4 项专项测试：有界流解包、CRC/垃圾字节处理、支持集过滤、per-type newest-only、1 Hz 观测限频、TTL 过期和参考帧优先均已覆盖。全包 14 项测试、TypeScript build 和 lint 通过。该模块尚未接入 NTRIP、端口命令链或串口发送，因而不能被视为 LIVE 或部署完成。
- 已完成待烧录的 PROBE stats V2：RTCM 新鲜度队列从 2 帧增至 4 帧，增加约 2058 B 静态帧存储；148 字节响应在 V1 的 92 字节基础上追加 1005/1033/1074/1094/1114/1124 完整帧计数，以及 field-link 解码帧、RTCM 帧、解码错误、序号缺口/重复/重启和 RX FIFO 丢弃。Python 门禁可用 `--require-stats-version 2` 强制按类型和链路零增量核对，TypeScript 协议库保持 V1/V2 双栈。C99 主机测试显示重组器 5616 B、队列帧区 4116 B；field-gateway 15 项测试/lint 和 A 的 `DISABLED/PROBE/LIVE` 三模式全量构建通过。该固件尚未烧录，不能替代 A/B/C 真机证据。
- 本 checkpoint 和提交均不包含 CORS 主机、账号、密码、真实坐标或现场原始日志。

## In Progress

- 软件边界、离线容量模型、新闭环统计、A/B/C 发布包和 RK3568 部署均已完成。A/B 已通过三核心星座共同候选的 60 s 合成 PROBE；C 当前离线，真实 NTRIP 和三节点混合负载仍未通过，不能进入 LIVE。
- RK2206 当前没有独立可信的 Unix 时钟。节点可执行 1500 ms 重组超时和最多 3000 ms 本地队列龄，但绝对生成时间 TTL 只能计为 `ttl_unverified`，由 RK3568 先做绝对新鲜度过滤。
- 现有 GPS 驱动已阻止 RMC 状态错误设置 Fixed，并公开原始 GGA quality；完整 GGA/GSA/GST/GSV/RMC/ZDA 定点解析和 `GNSS_CORE` 1 Hz 上送尚未实现。

## Next Actions

- 保留本地报告 `docs/reports/xls1-gnss-v31-capacity-20260726.json` 作为可再生证据；原始 RTCM 抓包降为可选精化，不再作为进入单节点 `PROBE` 的阻塞项。
- 保持 C 为离线/不可用状态，不伪造遥测，但在所有容量报告中固定预留 180 B/s；A/B 的实测结论与 C 的估算必须分栏展示。
- 保留分级包率报告作为链路证据。旧 `250 B/6 Hz` 试验仍使用 160 B 分片，实际形成 12 个 field-link 包/秒；它证明高包率失败，不能单独证明 250 B 单包不可用。320 B 单包虽把 0.5 Hz QZSS 的丢失从 2 包降到 1 包，仍未过严格门禁，因此生产路径暂沿用已通过的三核心星座、160 B 分片和 160 ms 平滑调度。恢复 QZSS 前先设计有界累计确认/选择性重传，并验证三节点确认时隙、correction age 和 compact 遥测共存。
- C 恢复后补三核心星座 `um220-shaped` 12 s/60 s PROBE。只有 A/B/C 都通过 accepted/completed/bytes 精确门禁，才进入真实 NTRIP 混合负载。
- 真实门禁负载包含 RTCM、3 个 1 Hz `GNSS_CORE`、compact 环境遥测和控制命令；记录每节点 correction age P50/P95/max、Fixed 连续性、CRC、重组、队列、注入、旧 session 和命令延迟。
- 至少运行 60 分钟；初始通过条件为 correction age P95 <= 3 s、max <= 5 s、没有旧 session 注入且 Fixed 连续。未通过前保持 `LIVE` 关闭。
- 传输通过后再完成 RK2206 定点 GNSS 解析与上送、RK3568 ECEF/ENU/Hampel/Kalman、服务器 CEEMDAN 和 UI/profile 集成。

## Risks

- 115200 只是 MCU-UART 标称值，不能证明 DL-XLS1 的广播、半双工、内部重试和队列吞吐。
- gateway 输入 RTCM CRC 正常不等于节点收到新鲜修正；必须使用节点端完成/注入/TTL 证据。
- RK2206 无可信绝对时钟时，旧模块队列风险不能只依赖节点 TTL；session epoch 必须持久化，网关必须先拒绝过期数据。
- 新 PROBE-stats 已在 A/B 真机响应并暴露包率损失，C 尚未恢复；`LIVE` 仍只有可构建证明。不得由查询成功、UART 字节余量或历史 compact 三节点证据推导 RTCM PROBE 通过或厘米级三节点已部署。
- 单 NTRIP 流供 3 台 rover 使用仍需确认服务商授权和同站点空间范围。
- 汇总日志证明平均输入负载，但不能证明 RTCM 单帧尺寸分布或亚秒级突发；不得用 16.91% UART 估算替代 XLS1 节点端完整率和 correction-age 证据。
- 过滤 1084 与 1124 限频有明确的接收机支持集和链路容量依据，但合成 PROBE 不能证明真实 Fixed 连续性；必须在 LIVE 前用真实 CORS 输入和节点 GGA/correction-age 证据验证，失败时回滚为关闭而非偷偷放宽门禁。
- C 离线不会减少生产容量预算，但会让三节点在线、三节点混合负载和最终厘米级系统验收保持未完成；不得以历史在线证据替代当前 C 复测。

## Resume Prompt

继续 V3.1 传输门禁：A/B 已通过三核心星座共同候选；B 的 60 s 证据为 252/252 分片、192/192 帧，A 已通过包含额外 QZSS 的更高负载。C 离线并继续预留 180 B/s。field-gateway shaper 默认关闭 QZSS 且尚未接线；先等 C 恢复补 12 s/60 s PROBE，再接入唯一端口调度器，加入 160 B 分片、160 ms 包间隔、持久 session epoch 和状态计数。随后做真实 NTRIP + 3 个 GNSS_CORE + compact 遥测 + 控制命令混合门禁；保持 LIVE 关闭。
