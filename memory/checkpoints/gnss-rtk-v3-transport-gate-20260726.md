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
- 已完成并烧录 PROBE stats V2：RTCM 新鲜度队列从 2 帧增至 4 帧，增加约 2058 B 静态帧存储；148 字节响应在 V1 的 92 字节基础上追加 1005/1033/1074/1094/1114/1124 完整帧计数，以及 field-link 解码帧、RTCM 帧、解码错误、序号缺口/重复/重启和 RX FIFO 丢弃。Python 门禁可用 `--require-stats-version 2` 强制按类型和链路核对，TypeScript 协议库保持 V1/V2 双栈。C99 主机测试显示重组器 5616 B、队列帧区 4116 B；现场结果见后续条目。
- 实现提交 `c0eff2a3fe3a82d13a251fcdb093c71ecbf547a5` 已推送。A/B/C V2 PROBE 发布包位于 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_stats_v2_20260727`，manifest 指向该提交；9/9 二进制哈希复算匹配，A/B/C `Firmware.img` SHA-256 分别为 `2f5995a3dfb8bbd864923405053e8927cc3a1db351aba2d799d20d2e5dbcb15c`、`7a4d86d512551cebbce817aaae07b222bab953de9f790a1388fd47613f4a3777`、`cee103b959bee76b14f1a54da9d6ad9b8eda0987f59beb51f0273daa9b02be54`；每个 liteos 只含自身 UUID、PROBE 标记和 V2 固件标记，loader 三份一致。兼容 V1/V2 的探针已部署到 RK3568，SHA-256 为 `c63b5499731ddb480d86dec9bb5af11d80c34869a1c18087f6cbb074f035de6c`，自检通过且服务保持 active。
- V2 烧录后 A/B 的 12 s 三核心星座均完整：50/50 分片、38/38 帧、5360/5360 B。B 首轮仅因共享多发送者的全局 sequence gap/reset 误报失败；门禁现只把这三项作为诊断，仍严格核对 decoded RTCM、按类型、CRC、重组、队列和 FIFO。
- 当前链路的 60 s 无重传复测真实失败：`160 B + 128 B/0 ms` 时 A 200/252、B 249/252；`32 B/15 ms` 更差，`320 B` 在 A 短测也更差。全量 V2 统计逐秒查询虽能最终补齐 A 的 38/38 帧，但造成重组超时和严重调度漂移，不能作为 ACK。
- 已实现 24 B `G3A` ACK V1，bit 0..15 表示最高序号向前 16 个完成帧。查询/响应 nonce 定向，响应只在 DataProcessTask 发送；复用现有完成缓存，没有扩大 5616 B 重组器或 4116 B RTCM 队列。Python 选择性补发按精确序列重发，并以 3 s 恢复、500 ms 最大调度迟到、25% 补发比例作为硬门禁。C99、Python、TypeScript 16 项测试/lint 和三模式 A 全量构建已通过；ACK V1 包尚未实际烧录。
- ACK V1 发布包位于 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_ack_v1_20260728`，对应源提交 `a43318206a84f09841517a9d5f3a2ae7c5d1ac95`。A/B/C `Firmware.img` SHA-256 为 `1c60b42ccfdc0f90f30f576cfe7236cf911577734f5dfa1ddf5db56fbafcc79d`、`6cd2b71edc3219c28f5c6b9a8b85ebf67c32ed0edd4c658beefcff29639bec29`、`9ef0916d85a27a4743e4a5b99b8954aceb8c0733b15c9bbcec425943204679a6`。RK3568 已部署匹配探针，SHA-256 `6f0e5a866a0de337aa6379b583cad1e8cc71509f2acb39213deb7f890056b1e4`，自检通过。
- 2026-07-28 用户报告重新烧录上电后，A/B 的 `G3S` V2 统计均能返回且模式为 `PROBE`，但两次 12 s 选择性补发均在第一个窗口失败：节点在 3 次、每次 1 s 的查询内没有返回匹配 `G3A` ACK。失败报告为 RK3568 `/var/lib/lsmv2/experiments/xls1-gnss-v31-probe-20260727-011707.json` 和 `...-011800.json`；文件名日期受板端错误系统时间影响。
- 为排除发送器过滤或短超时，网关运行时屏蔽后直接向 A/B 各发送一个 30 B ACK 查询线帧并抓取 6 s：两者均为 `controls=0`、`decode_errors=0`。随后 A 的非选择性 1 s 闭环仍正常返回前后 V2 统计并以 4/4 分片、3/3 完整帧、430/430 B 通过，报告为 `...-012308.json`。这排除了 RK3568 解码故障和 ACK 调用导致 DataProcessTask 锁死。Windows 最近文件记录确认 18:56-18:58 实际打开的是旧 `xl01_gnss_rtk_v31_probe_stats_v2_20260727\A/B/C`，而 ACK V1 包在 19:54-19:55 才生成，因此当前节点确定仍运行旧 V2。
- C 后续已通过定向 `G3S` V2、`G3A` ACK V1、普通轮询 ACK 和 1 秒 4/4 分片、3/3 帧闭环，身份正确为 `...0003`，因此 XLS1 双向控制链在线。C 的 `telemetryMessages=0`、`latestTelemetry=null`、`lastTelemetryTs=null` 仍成立，问题是传感器采样或 compact 遥测生成异常，不是 XLS1 基本配对失败。B 是用户主动下电。测试后 `lsmv2-field-gateway.service` 已恢复 `active`。RK3568 板端绝对时间仍不可信，合成门禁继续只使用单调时钟。
- 2026-07-29 用户确认土壤探头使用三合一。远端 `feat/gnss-rtk-v31-transport` 生产配置确认实际硬件路径为 UM220-IV NK、RS-ECTH-N01-TR-1 温湿度/EC 和 RS-DIP-N01-1 三轴倾角；SHT30、MPU6050 是关闭的遗留样例，雨量关闭。不得再从遗留驱动文件存在推断安装了 MPU6050。
- `ed803b0e` 新增向后兼容的 204 B `G3S` V3 传感器诊断，记录 4 条实际采集路径的 enabled/init/current/ever 位、采集周期数、最后成功单调 uptime 和连续失败数。RS-ECTH 基础寄存器与 EC 寄存器分开统计，以识别 EC-only 故障；init 位仅表示本地 UART 或 SC16IS752/Modbus 初始化成功。C99、Python、field-gateway 17 项测试/lint 以及 A 节点完整 OpenHarmony 构建通过。
- A/B/C PROBE 诊断发布包为 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_sensor_diag_v3_20260729`。9/9 哈希、节点身份、固件标记、RS-ECTH 型号、PROBE 模式和 loader 一致性均复核通过；A/B/C `Firmware.img` SHA-256 为 `363bb6841354d6aa92fab4e006b1b018f838bc190d1e5888d3a6c36f5b0e1c00`、`ad5080526d443ad4095a7592466953ee88cb7dea7374584e13ce622f2136d7f3`、`7a768f53b4f4161b4582c3f7059b07512b68fff63e401ec9b55031750b78611e`。该包仍不向 UM220 写 RTCM。
- 当前探针已部署到 RK3568 `/usr/local/bin/xls1_gnss_v31_probe_sender.py`，板端和本地 SHA-256 均为 `189f1e65e00428ca14055a26c72378ad6d880f28c807dbd905065c2151705ef6`，自检通过且 field-gateway 为 `active`。板端保留旧脚本备份；统一烧录前未在旧固件上强行执行 V3 查询。
- 2026-07-29 V3 包烧录后的 RK3568 真机复核已完成。A 为 `version=3 mode=1`，`enabled/init=0x0F`、`current/ever=0x0E`，RS-ECTH 基础、EC、RS-DIP 三条 RS485 路径均有效；UM220 暂无有效定位。C 为 `version=3 mode=1` 且控制链双向在线，但连续两次均为 `current/ever=0x00`，第二次四路径均 `samples=126`、`last_ok_uptime=0`、`fail_streak=126`，证明采集循环运行但本地所有传感器路径从未成功。A 的同固件对照将 C 故障收敛到共同供电/GND、接线、两路 RS485/SC16IS752 或 C 板硬件，不能再归因于通用固件或 XLS1 配对。B 连续 5 次定向查询无响应，且 compact 遥测为零，当前按链路离线且固件身份未确认。
- 查询结束后 field-gateway 自动恢复 `active`，串口和 MQTT 均在线；等待十余秒后 A 恢复 online（seq 345），B/C 仍为 configured/no-node-activity，协议拒绝、写失败和交织计数均为 0。板端时钟仍错误，现场报告路径中的 `20260726` 仅为错误系统时间生成的文件名。
- 本 checkpoint 和提交均不包含 CORS 主机、账号、密码、真实坐标或现场原始日志。
- 后续统一重刷 V3 后，A/B/C 均能返回定向控制响应。A 的 RS485 三条路径正常；B 连续 47 周期、C 连续 53 周期所有路径 `ever=0`，且停止 field-gateway 35 秒不改变失败事实，排除 RK3568 丢失已生成数据。B 核心板在 C 位置能读土壤/EC而回 B 位置失败；C 核心板烧 A 固件仍失败，而 A/B 核心板在 C 位置能读土壤。故障已分为 B 位置外部链、C 核心板/U4/接触，以及 C 倾角外部链，不能归因于节点身份或通用 V3 固件。
- `b8cdd26c` 新增 384 B `G3S` V4，只追加底层诊断并完整保留 V1/V2/V3 前缀及 compact 遥测。它结构化上报 U4 地址与双通道自检、13 类每通道 Modbus 计数，并在启动时做一次地址 1、`0x03/0x04`、双通道、4800/9600、1.8432/14.7456 MHz 的只读有界扫描，随后恢复 1.8432 MHz/4800。扫描不写传感器配置，组合命中也不作为型号身份证据。
- V4 正式 PROBE 包为 `F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_sensor_diag_v4_20260729`，manifest 来源 `b8cdd26c9f4706dc5937c09a6d4ffd72dbd60ab3`。9/9 哈希和 A/B/C 身份复核通过；A/B/C `Firmware.img` SHA-256 为 `8093162cf3a0ce3a748b8b96d4d2948034bbc65f5b25ebaea45a89b9b91f2b91`、`6c02590545153da68b909a2cea8e094a3c02023e12748e347bb130228160be52`、`7dec8c46f17c370a52459dd128c83a5c128b34121e171a071b6b64cb10243d23`。RK3568 已部署匹配脚本，SHA-256 `3963c1f263b2a4ca44ed9ee796ae06ad487395971a2c94aaa834831c0daacd41`，自检通过。
- 2026-07-29 V4 真机诊断完成。A 的 U4 `0x4D`、双通道 scratchpad/内部 loopback/UART 全通过，loopback 各收 4 字节，`LSR=0x60`；只读扫描 2/2 命中两个配置查询形状，双通道有持续 RX，三条 RS485 传感器路径有效。B/C 均能返回正确身份的 V4 控制响应，但双通道 scratchpad 为 `[-2,-2]`、loopback 为 `[-2,-2]`、`LSR=0x00`；每节点 48 个扫描组合零命中，全部 Modbus 请求都在写入 U4 UART 阶段失败且 RX 为 0。`scratch=-2` 是测试值读回不一致，`loopback=-2` 是 FIFO 写不完整，并非外部探头无响应。因此 B/C 首查 U4 模块/版本/晶振、3.3 V、插座和主板 I2C，不先更换传感器。查询后 field-gateway 为 `active/running`、`NRestarts=0`。
- B 核心板交叉试验已完成：A 核心板在 B 位置连续两次为 scratchpad/loopback/UART 全 0、`LSR=0x60`，土壤/EC/倾角有效；原 B 核心板在 A 位置仍为 scratchpad/loopback `[-2,-2]`、`LSR=0x00`，全部 Modbus 请求停在 U4 UART 写阶段。故障随 B 核心板而非位置侧载板/U4/RS485/探头移动，B 应查 EI2C0_M0 PB4/PB5、排针接触/焊点和核心板 I2C/3.3 V，或直接更换核心板。两次查询后 field-gateway 均恢复 active/running。
- C 核心板在同一已知正常的 A 位置也保持 scratchpad/loopback `[-2,-2]`、`LSR=0x00`、48 个扫描组合零命中和双通道零 RX，证明 C 故障同样跟随核心板。至此交叉矩阵完整：A 核心板在 B 位置工作，B/C 核心板在 A 位置均失败；位置侧 U4、RS485、线束和探头不是当前首要更换对象。查询后 field-gateway 为 active/running、`NRestarts=0`。
- A 核心板最终放回 A 位置后再次通过：U4 scratchpad/loopback/UART 全 0、`LSR=0x60`，土壤/EC/倾角均为 current valid。倾角 74 次请求中累计 5 次 no-response，但当前 fail streak 为 0 且无 CRC/帧错误，后续长测观察；室内 GNSS 未定位导致整体 degraded，不影响本次 RS485 基准回归。field-gateway 仍为 active/running、`NRestarts=0`。
- 生产 ClickHouse 只读复核证明 C 的土壤/EC/倾角在 2026-07-26 19:02:59 UTC 停止，此后仅 GPS；B 在 C 停止后仍持续写入 128793 条土壤基础、128769 条 EC 和 125587 组倾角，土壤温度和三轴倾角具有真实变化，分别持续到 7 月 29 日 14:03:38/11:20:22 UTC。因此 B 在 C 故障后长期具备有效的 U4 双通道采集，当前 V4 换位失败不能直接解释为永久坏引脚。B 的湿度/EC 后续值始终为 0，恢复后仍需验证读数合理性。
- 代码差异确认稳定 compact `6d448134` 到 V3 `ed803b0e` 未修改三份 U4/Modbus/现场传感器驱动；V4 才追加自检和只读扫描，但 B 传感器停止早于 V4 包生成。RK3568 服务停止 35 秒时 B/C 本地失败计数仍增长，也已排除“RK3568 丢掉已生成传感器数据”为当前 U4 故障根因。后续采用同硬件、同位置、单侧版本变化的旧稳定 B -> V4 B 对照，不同时回退网关。
- A 核心板移到 C 位置后的最新试验中，A/C 两种目标身份均无控制响应，普通 compact 接收也从 1 节点降为 0；当前 C 位置需先恢复 XLS1/TTL、供电或插接链，尚不能据此判断传感器状态。
- 2026-07-30 用户确认 A 先前上线依赖接回 XLS1 天线，之后同一根天线与 A 核心板均移到 C。RK3568 此时仍每秒成功写 compact 广播轮询，但健康计数从最后一帧后完全停止接收，且连续 3 次定向 `target=A` V4 查询无匹配响应；服务测试后恢复 `active`、`NRestarts=0`。这把当前问题收敛到 C 位置的 XLS1/TTL 本地链、供电/地、天线端口、持久无线/UART 参数或 XLS1 上行发射，不支持“RK3568 收到后丢包”，也不能据此评价 A 核心板的 U4/传感器。
- 2026-08-01 新 RK2206 已到、DL-XLS1 网络已由用户配置完成，但 SC16IS752/RS485 接口元件尚未到。手册与代码再次确认 `101` 是固定 USR 配置端口而不是射频信道，信道由 `103:/C` 管理；RK2206 只通过 `EUART2_M1 PB2/PB3 @ 115200` 发送业务数据，不在启动时改地址、PANID、信道或 `/D` 路由。
- 新增安全的 `FIELD_SENSOR_SOURCE_SIMULATED` 构建配置：只生成土壤温度、含水率、EC 和三轴倾角，真实 UM220 GNSS 与真实 PC0 电池采样保持启用；模拟数据在 compact v2 状态位中明确标记。该配置下四个 RS485 实现文件编译为空单元，最终 `.bin` 不含 `SC16IS752`、`[RS485]` 或 `EI2C0_M0 PB4/PB5` 字符串，PB4/PB5 不会被初始化。
- Compact Telemetry v2 仍保持 46 字节 payload、64 字节完整 COBS/CRC 线上帧；新增 PC0 电池电压、百分比、估算质量和 RS485 模拟标志。RK3568 field-gateway 保持 v1/v2 双栈并可区分 `field_sensor_source=simulated/hardware`，19 项测试、TypeScript build 和 lint 均通过。
- 电池按用户当前提供的 `3S2P / 5000 mAh / 11.1 V / 55.5 Wh` 规格记录，并联数与容量仍需以电池标签或规格书最终确认。RK2206 SARADC 为 10 位 `0x3FF`，PC0 使用 16 次采样、至少 12 次有效、两端各裁 2 点、100k/27k 分压换算、单点增益/偏移校准、IIR 和细化的 3S 锂离子 OCV 曲线。正式包仍标记 `default-calibration`；未用万用表对每块板单点校准前，不宣称剩余 mAh、续航或百分比为实验室精度。
- C99 `-Wall -Wextra -Werror` 主机测试通过：RTCM 重组/队列、G3S V4、电池估算和 compact v2/64 字节线上帧全部通过。静态引脚门禁结果为 `XLS1=PB2/PB3 GPS=PB6/PB7 BATTERY=PC0-input RS485=PB4/PB5-hardware-only`。模拟版和真实 RS485 版 A 节点都完成 OpenHarmony `hb build -f`，证明明日只切构建参数即可恢复硬件采集。
- 可复现源码提交 `340d3a68316ebcefa2139f1b9e2b46079ef0e5a3` 已推送到远端 `feat/gnss-rtk-v31-transport`。正式 A/B/C 模拟链路测试包位于 `F:\2\openharmony\rk2206_firmware_releases\xls1_link_rehearsal_battery_simulated_20260801`，manifest 为 `sourceDirty=false`、RTCM injection disabled、RS485 hardware initialized false。
- 正式包的 A/B/C `.img` SHA-256 分别为 `f4ac0a5b321558b80f1294912795a4fbf6e1f5cd8f43451458b353a0160fee9f`、`feb040047f74b63b5a32719ea59696c112a9686ae74884069ad256210d3b0ad2`、`dc4311cf467a1d6d67c34dac6524219ec351b8b40329ed78986eb9e14bcdd66e`。7 个 manifest 二进制哈希独立复算无差异，三个 `.bin` 均只包含自身 UUID/安装标签和 `SIMULATED (RS485 values only)` 标记。

## In Progress

- 正式模拟包已经生成但尚未烧录到新 A/B/C RK2206；下一步是用户按节点标签烧录并上电，然后由 RK3568 做“稳定优先”的三节点轮询基线与参数扫描。
- 当前默认保持已验证的 46/64 字节 compact v2、`32 B/15 ms` UART 分块和 340 ms 节点时隙。不得在基线未通过时同时修改包格式、轮询时隙、分块和 XLS1 模块参数。
- RS485 元件未到期间，模拟包故意不初始化 PB4/PB5。接口到货、焊接与断电电气检查完成后，使用同一构建脚本把 `-FieldSensorMode simulated` 切成 `hardware`，不可手工删除模拟函数或修改 XLS1 驱动。
- RTCM injection 仍保持 disabled；本轮先建立纯 compact 传感器数据的三节点稳定/延迟基线，再恢复真实 GNSS/RTCM 混合负载门禁。

## Next Actions

1. 将正式目录中 A/B/C 对应的 `.img` 分别烧录到物理 A/B/C；不要互换身份，不要使用 `_verification_*` 目录。缺少 RS485 接口时保持 PB4/PB5 外设断开，XLS1 模块配置不改。
2. 三节点上电后先核对串口启动信息：自身 UUID/`FIELD-NODE-*`、`Field Sensor Source: SIMULATED`、`RS485 Bus: OFF`、PC0 battery ready；任何节点出现 `SC16IS752` 或 `[RS485]` 立即停止测试并复核镜像。
3. 通过 RK3568 记录每节点应答数、序号连续性、超时、重复、CRC/COBS 错误、P50/P95/max 延迟和公平性。先跑当前 340 ms/`32 B+15 ms` 10 分钟基线，再跑 60 分钟稳定门禁；基线不为零丢失时不提速。
4. 基线稳定后才按单变量顺序测试更高吞吐：先缩短 UART chunk delay，再比较 64 B chunk，最后才缩短节点时隙。每轮只改一个参数，测试后恢复服务并保存原始报告；最优方案首先要求零丢失和无节点饥饿，其次才比较延迟/吞吐。
5. 每个节点用万用表测电池包电压，并与平台 `battery_v` 同时记录。按 `gain_ppm = measured_mv / reported_mv * 1000000` 分别重建对应节点，校准后再评价电量百分比；2P/5000 mAh 不改变电压曲线，只影响容量和续航。
6. RS485 接口到货后先断电做方向、短路、3.3 V、PB4/PB5 上拉和模块型号检查，再执行 `build-xl01-compact-broadcast-v2.ps1 -FieldSensorMode hardware -GnssRtcmInjectionMode disabled` 生成真实采集版；硬件版必须重新跑引脚门禁和 A/B/C 身份/哈希核验。
7. 真实传感器链稳定后再恢复 RTCM PROBE/LIVE 的既有门禁，最终混合负载仍需覆盖 RTCM、3 个 GNSS_CORE、compact 遥测和控制命令。

## Risks

- 115200 只是 MCU-UART 标称值，不能证明 DL-XLS1 的广播、半双工、内部重试和队列吞吐。
- gateway 输入 RTCM CRC 正常不等于节点收到新鲜修正；必须使用节点端完成/注入/TTL 证据。
- RK2206 无可信绝对时钟时，旧模块队列风险不能只依赖节点 TTL；session epoch 必须持久化，网关必须先拒绝过期数据。
- 新 PROBE-stats 已在 A/B 真机响应并暴露包率损失，C 尚未恢复；`LIVE` 仍只有可构建证明。不得由查询成功、UART 字节余量或历史 compact 三节点证据推导 RTCM PROBE 通过或厘米级三节点已部署。
- 单 NTRIP 流供 3 台 rover 使用仍需确认服务商授权和同站点空间范围。
- 汇总日志证明平均输入负载，但不能证明 RTCM 单帧尺寸分布或亚秒级突发；不得用 16.91% UART 估算替代 XLS1 节点端完整率和 correction-age 证据。
- 过滤 1084 与 1124 限频有明确的接收机支持集和链路容量依据，但合成 PROBE 不能证明真实 Fixed 连续性；必须在 LIVE 前用真实 CORS 输入和节点 GGA/correction-age 证据验证，失败时回滚为关闭而非偷偷放宽门禁。
- C 控制链在线但传感器遥测为空不会减少生产容量预算；它仍使三节点传感器在线、三节点混合负载和最终厘米级系统验收保持未完成。不得以 ACK/G3S 响应替代当前传感器有效位和 compact 遥测证据。
- V4 启动扫描会尝试重叠的地址 1 寄存器组合，因此“soilQuery/tiltQuery found”仅证明该组合收到合法 Modbus 响应，不能单独证明物理型号。若 U4 自检通过且双通道 `rx_bytes=0/no_response>0`，故障才收敛到 U4 外部的隔离收发器、供电/GND、A/B、线束或传感器；有 RX 但 CRC/短帧异常则优先检查信号完整性和 UART 参数。

## Resume Prompt

继续 2026-08-01 XLS1 三节点链路排参：从 `F:\2\openharmony\rk2206_firmware_releases\xls1_link_rehearsal_battery_simulated_20260801` 按标签烧录 A/B/C。源码和远端均为 `340d3a68316ebcefa2139f1b9e2b46079ef0e5a3`；模拟包只模拟 RS485，真实 UM220 和 PC0 电池保留，PB4/PB5 不初始化，RTCM disabled。上电后先从 RK3568 验证三节点身份和 340 ms/32 B/15 ms 零丢失基线，再按单变量提速。电池为 3S2P 5000 mAh，未逐板万用表校准前只能把百分比视为电压估算。接口到货后只用 `-FieldSensorMode hardware` 切回真实 RS485，不改 XLS1 模块或驱动。
