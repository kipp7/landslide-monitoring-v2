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

## Scheduler Starvation And Empty-Poll Recovery (2026-08-06 17:13 CST)

- 长差分龄的网关侧根因已定位并修复：三节点 core 一轮实际约 `2.2--2.6 s`，超过原
  `2000 ms` deadline，导致 P4 RTCM audit 长期饥饿，约 90 秒后误判 targets unarmed。
  audit 现可越过 overdue core，未 armed 时强制 P4，正常审计频率为每 5 个 core round。
- 修复后 600 秒 LIVE 为 `211 issued / 210 completed / 1 timeout`；CRC、schema、交织和
  写失败全 0，最后 120 秒 A/B/C 均 `12/12 GGA=4`。观测帧 caster-to-field P95
  `1131 ms`，串口写 P95 `216 ms`；差分龄最大 `11/10/9 s`，因此只有 `<=6 s` 样本可进入
  高可信位移门禁。
- 唯一 timeout 是一次广播命令后 `0/3` 节点响应：旧逻辑先等 `1500 ms`，再对 A/B/C
  各做一次 `1500 ms` 定向等待，最后再退避 `2000 ms`，将一次 XLS1 下行丢帧放大到约
  `8.5 s`。现改为零响应时立即结束该窗口，首次按正常间隔快速重发；仅连续空轮询进入
  `2/4/8... s` 指数退避。部分节点响应的定向恢复保持不变。
- 快速恢复版部署后 180 秒 LIVE 为 `70/70`、poll timeout 0，所有传输错误为 0，平均
  `2.57 s/组三节点`；观测帧 caster-to-field P95 `1163 ms`。后段 GGA=4 时差分龄仍曾同步
  到 16 秒，而 fresh RTCM 传输未中断，证明剩余 age 波动在 UM220 载波解算/应用侧，不是
  RK3568 调度或串口堵塞。
- 两轮原始报告只保留在 RK3568 experiments 目录；结束后均恢复
  `NTRIP_ENABLED=false`、runtime probe、聚合 1，服务 active。凭据、坐标和原始 RTCM
  未写入 Git 或 memory；ABC 不需要因本次网关修复重新烧录。
- 后续单变量节拍测试否定了继续压 correction window：`1500 ms` 和允许下限 `500 ms`
  均仍约 `2.3 s/组三节点`。core deadline `1600 ms` 的完整 180 秒为 `77/77`、所有错误 0，
  即平均 `2.34 s/组`；压到允许下限 `1000 ms` 的 60 秒仍只有 `23 completed / 24 issued`，
  没有可重复收益。用户确认约 2.3 秒可接受，停止继续压缩协议或增加倾角历史帧。
- RK3568 生产环境现固定 `SOUTHBOUND_CORE_POLL_DEADLINE_MS=1600`，其余已验收参数保持不变；
  当前 fail-closed 为 NTRIP false、runtime probe、聚合 1、服务 active、`NRestarts=0`。
  runner 新增可选 correction-window/core-deadline 参数，默认仍为 `2500/2000 ms`，只用于
  单变量诊断，不会静默改变生产配置。

## Latest Resume State (2026-08-06 15:50 CST)

- 最终 low-rate V2 包的 60 秒纯通信复查完成：A/B/C 各 `48/48`，所有传输错误为 0。
  报告中的 3 个 profile violation 只是 B 先前 LIVE 的累计 RTCM 审计值仍非零。
- 同参数 600 秒 LIVE 尾窗三节点均 `12/12 GGA=4`，但 correction-age P95/max 已升至
  A `23/23 s`、B/C `24/24 s`；轮询 `82/100`，17 timeout、27 schema error。
- caster CRC、field write 和 interleaving 错误均为 0；serial-write P95 `213 ms`。
  直接异常证据为 `port-busy` P95 `6419 ms` 与 `targets-unarmed` P95 `8631 ms`，因此
  下一步应检查 RK3568 调度生命周期，不再归因于天气/天线或重复试波特率。
- 权威报告：
  `/var/lib/lsmv2/experiments/lowrate-v2-g3b4-live600-recheck-20260806-20260806-153824.json`，
  SHA-256 `681b4107e07a5b3b211c3750fce37247ccf96f924e6730bd8c5031d52a70afd6`。
- 测试结束已确认 `NTRIP_ENABLED=false`、runtime probe、聚合 1；生产服务 active，
  `NRestarts=0`。恢复时先读 gateway `port-busy` 判定、targets arming 生命周期及本轮
  schemaRejected 来源，修复并通过 build/test 后再构建固件或重复 600 秒 LIVE。

## Final V2 Hardware Package (2026-08-06)

- 最终包已从 clean commit
  `b4c40a85df5a28c442c9d9b5f44e8b3537730c0d` 构建并通过发布安全门禁，未进行真机烧录。
- 包路径：
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_lowrate_v2_corefast_rs485_gnss_hardware_live_final_20260806`
- manifest SHA-256：
  `a160e5ed61254be8efd0603c7b3729aad4a15ca2704a70cf19d0350b0275b7aa`
- A/B/C `.bin` SHA-256：
  `800756c70de9b553b445e9ca1e62bde482d47d27881e2c0182eba020c18656e2` /
  `202366ec8490bf83a1173274852efe7e014c84ec6112a61d7b24bf68f765df73` /
  `efb72b834c8428e726663334d39afb8b9bd8356f41454ebe37433875c93c8019`。
- 当前 RK3568 运行状态要求保持 `NTRIP_ENABLED=false`、runtime `probe`、聚合数 `1`；
  烧录后先做 4 秒纯通信门禁，再按 `G3R -> G3B=2 -> G3B=4 -> LIVE` 进入实测。

## Quick Core Gate (2026-08-06)

- 20 秒真实硬件 Compact V6 core 短测通过：A/B/C `13/13` 完整轮次，所有协议/profile
  错误为 0，报告 SHA-256 为
  `719cfb652e33f431596faf11ea847d22731a2a1aa9b36f1e1cca52400fd451b5`，报告留在 RK3568
  `/var/lib/lsmv2/experiments/xls1-compact-v6-layered-0020s-20260806-141155.json`。
- A/B/C 到达间隔 P95 为 `2355.9/2360.1/2356.4 ms`，属于共享 XLS1/网关轮询观测，不能
  反推 RK2206 倾角本地采样恰为该周期；短测只证明通信闭环，不证明 RTK 或严格 1 Hz。
- 测试后网关已恢复 `active/running`、`NRestarts=0`、三节点在线、串口/MQTT 在线，保持
  `NTRIP_ENABLED=false`、runtime `probe`、聚合数 1。

## Strict 60/600-Second Communication Gate (2026-08-06)

- 真实硬件 GNSS、RTCM disabled 条件下，60 秒 `39/39`、600 秒 `470/470` 核心轮次全部
  完整；解码、64 B 线长、未匹配、重复、恢复冗余、scope、epoch、profile、尾部残字节错误
  均为 0，定向恢复命令为 0。600 秒期间 environment `9/9`、audit `8/8` 全匹配，严格
  4 秒窗口内不同倾角 `sample_epoch` 门禁通过。
- 600 秒 A/B/C 到达间隔 P95 为 `1802.0/1812.2/1797.7 ms`，命令延迟 P95 为
  `837.0/1131.1/1444.9 ms`；三节点各 `470/470` 均走初始 P1 路径。报告 SHA-256 为
  `8b47d3b3a66c8215457cf76e0ed3ca64e544ce71212149e780ecb3219bbb3231`，汇总 SHA-256 为
  `84caa922bf627cb0d1e7b36931e9814f2abb5e0c23914512981a7400c5f6e3f5`，原始文件只留 RK3568。
- 外层 Windows SSH 等待在远端报告完成后超时；首次复核误查了不存在的
  `field-gateway.service` 别名，该 inactive 结果无效。真实生产 unit
  `lsmv2-field-gateway.service` 为 `active/running`、`NRestarts=0`，journal 证明从
  14:36:48 自动恢复后 A/B/C 串口/MQTT 连续发布；NTRIP disabled、runtime PROBE、聚合数 1。
  后续必须使用精确 unit 名实查，不能把错误别名当成服务故障。
- 当前可接受“三节点通信与采集节奏 600 秒通过”，仍不可写成 RTK/厘米级通过；下一阶段
  才进入受控 PROBE/LIVE、GGA=4/差分龄/solution age 和最终 1800 秒混合负载门禁。

## Compact V6 Low-Rate V2 Core Timing (2026-08-06)

- 数据合同复审结论：核心 46 B/完整 64 B 线框没有可删除且能降低空口负载的字段；GNSS
  精度证据、倾角、环境、电池和 RTCM 审计继续保留。
- 新版核心倾角 RS485 读取使用 `300 ms` 超时和 1 次重试，计入两次各 `50 ms` TX 等待后
  最坏约 `780 ms`；低频土壤/EC 保持 `300 ms/0 retry`，环境采样 10 秒，核心倾角/GNSS 1 秒。
- 源码 marker 已升为 `v1.9...lowrate-v2` / `fw-...lowrate-v2-live-20260806`。同一
  clean commit `9b9be527a594085283747099c88812080f8f2b8a` 已生成正式 A/B/C hardware
  LIVE-capable 包：
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_lowrate_v2_corefast_rs485_gnss_hardware_live_20260806`。
  manifest SHA-256 为
  `9310ed3eb0bcf193a308e4d71b832b1f692af2d94eff318246e3a6ef9700704b`；A/B/C `.bin`
  SHA-256 分别为 `800756c70de9b553b445e9ca1e62bde482d47d27881e2c0182eba020c18656e2`、
  `202366ec8490bf83a1173274852efe7e014c84ec6112a61d7b24bf68f765df73`、
  `efb72b834c8428e726663334d39afb8b9bd8356f41454ebe37433875c93c8019`。旧 v1 包不应与
  本次源码混烧。

## Objective

在不更换 UM220-IV NK、BT-760 和 DL-XLS1/XL01 的前提下，先证明 RK3568 到 3 个 RK2206 的 RTCM 与精密 GNSS 数据链稳定、及时、可追溯，再进入 ECEF/ENU、Hampel/Kalman、服务器 CEEMDAN 和比赛界面。

## Last Confirmed State

### Compact V6 Low-Rate V2 Core-Timing Source Gate Passed; Hardware Flash Pending (2026-08-06)

- 同一个 Compact V6 线框内完成采样分层：倾角和 GNSS 保持 1 秒核心采样；PC0 电池、
  土壤温度、含水率和 EC 改为 10 秒。SHT30、MPU6050 和雨量仍不进入当前合同。
- RS485 每轮先读倾角，再读低频土壤/EC。低频路径固定 `300 ms / 0 retry`；单次失败
  清除有效位且不上传伪造 0，两次计划读取之间保留最近有效值。EC 不可用后的重新探测
  从 60 次改为 6 次低频读取，仍约为 60 秒。
- 仅当后面还有 RS485 请求时保留 80 ms 间隔，倾角单独采集不再额外空等。Compact V6
  仍为 `46 B payload / 64 B wire`，GNSS 专业证据和电池双指标不删，因为固定线框下删
  字段不减少空口负载。
- RK3568 新增 2 秒 core dispatch 截止；到期时 core 优先于 RTCM 和 P3/P4。P3/P4 同时
  到期时均排队，先 audit 后 environment，不再丢 environment。
- 源码标识为 `v1.9-um220-rs485-rtk-compact-v6-lowrate-v2` /
  `fw-rk2206-rtk-compact-v6-lowrate-v2-live-20260806`。核心倾角专用路径为 `300 ms + 1`
  次重试，环境路径仍为 `300 ms + 0` 次重试。网关 build、lint、`76/76` 测试、
  RK2206 C99 host tests、采样周期、引脚、RS485 启动、TX 顺序、marker 与原子快照门禁
  均已通过；A/B/C OpenHarmony 正式镜像尚未生成，不能让现场烧录。
- 下一步按物理标签烧录该 v2 包，再真机先关闭 RTCM 验收：每节点任意健康 4 秒
  至少两个不同 `sample_epoch`、倾角有效、协议错误为 0；随后做混合负载，要求持续
  `GGA=4`、差分龄 `<=6 s`、解算龄 `<=2 s`。低频单次超时只记缺失，不得拖垮 core。

### G3S V7 1800-Second Recheck: B Briefly FIXED; RF/Receiver Gate Still Open (2026-08-06)

- 保留参数 `RTCM32_GGB / aggregation=4 / burst=4 / guard=600 ms / observation=1 Hz`
  完整运行 1800 秒；JSON 中的 120 秒只是最终定位尾窗，不是总测试时长。权威报告为
  `/var/lib/lsmv2/experiments/g3s-v7-g3b4-live1800-20260806-011454.json`，monitor SHA-256
  为 `64e841e18c49338396edf92b082250ac9379e9a994e4fcc77f8e7f70fb9e19d7`。
- 全程为 `5712 caster / 3282 inner / 1570 outer / 303/303 polls`；caster CRC、field
  write、poll timeout、schema、交织错误均为 0，服务未重启。共享通信稳定性继续通过。
- 175 个约 10 秒样本中 A/B/C 的 `GGA=4` 数为 `0/14/0`。B 在 elapsed 1221 秒首次
  FIXED，持续至 1355 秒样本，约 134 秒；A/C 全程 FLOAT。最终 120 秒三节点仍为
  `0/12 GGA=4`，因此专业定位门禁仍失败，但“等待超过 120 秒也不能 FIXED”已被 B 的
  现场结果否定。
- 最终尾窗三节点 correction-age P95/max 均为 6 秒；完整序列的 A/B/C 最大值为
  `14/15/16 s`。B 在 1366 秒退回 FLOAT 时 age 仍为 4 秒，9--16 秒共同峰值随后才出现，
  不得把峰值写成 B 失锁的直接原因。约 5 秒 age 可兼容 FIXED，但会降低收敛速度和
  保持裕量，是风险放大因素而非唯一根因。
- LIVE 后 V7 再次证明 RK2206 路径很短：三节点完帧到出队 P95 `<=20 ms`、UM220 写
  P95 `<=10 ms`、完帧到写完 P95 `<=50 ms`，最大值 A/B/C 为 `53/37/34 ms`；GNSS
  UART read/reconfigure/FIFO drop 为 0。A/B 各注入 3282 帧并在 LIVE 停止边界各记录
  2 个 queue expiry，C 注入 3284 帧且 expiry 为 0；无 queue eviction、partial write、
  UART write error 或网关窗口内写失败。停止边界计数保留记录，但不伪装为窗口内丢包。
- 当前剩余范围是天线视野/遮挡/多路径、上游 RTCM 观测历元和 UM220 内部修正应用/
  模糊度固定；厚云本身不是优先嫌疑。停止调整共享 burst、guard、aggregation 和轮询。
  下一步做相同参数的单节点无遮挡对照，再按同一物理位置依次比较 A/B/C。
- 测试及逐节点诊断后已恢复 fail-closed：`NTRIP_ENABLED=false`、runtime probe、聚合 1、
  服务 active、`NRestarts=0`；凭据、坐标和原始 RTCM 未进入 Git 或 memory。

### G3S V7 Field Attribution Completed; RF/Receiver Gate Still Fails (2026-08-06)

- A/B/C 已烧录不可变 G3S V7 镜像并通过逐节点查询。三节点 UM220 均锁定硬件
  `115200`，UART read/reconfigure/FIFO drop 为 0；真实土壤、EC、倾角当前有效。
- RK3568 已原子部署完整同构 field-gateway，避免入口与协议文件混版。受保护环境仍为
  `root:root 0600`，凭据只存在该文件；测试前后均恢复 `NTRIP_ENABLED=false`、runtime
  probe、聚合数 1，服务 active、`NRestarts=0`。
- 真实 caster 分档 PROBE 全通过：G3R 为 `74 inner / 74 outer`，G3B=2 为
  `80/40`，G3B=4 为 `86/40`。三档 caster CRC、field write、poll timeout、schema、
  交织错误均为 0；A/B/C 接受/完帧/PROBE 计数一致，节点 CRC、重组、容量、队列和
  UART 错误均无增量。
- 旧合成发送器未取得 V7 runtime lease，因 boot DISABLED 被预期拒绝；其拒绝/解码
  计数贯穿正式阶段保持不变，不计入生产传输错误。后续不得再用旧脚本直接判定当前
  DISABLED/LIVE 固件的 G3R 门禁。
- 保留参数的 600 秒 LIVE 收到 1871 个有效 caster 帧，写入 `1058 inner / 503 outer`，
  普通轮询 `106/106`；CRC、写入、poll timeout、schema、交织错误全为 0。网关
  caster-to-field P95 `1120 ms`、shaper P95 `947 ms`、serial-write P95 `199 ms`。
- 定位质量未通过：最后 120 秒 A/B/C 均为 `0/12 GGA=4`，保持 RTK FLOAT；三节点
  correction-age P95/max 均为 6 秒，禁止建立 ENU 基线或生成专业位移。
- LIVE 后 V7 显示每节点注入 1061 帧/113954 B，UART partial/write、queue eviction、
  injection drop 全为 0；完帧到出队 P95 `<=20 ms`，UM220 UART 写 P95 `<=10 ms`，
  完帧到写完 P95 `<=50 ms`，A/B/C 总路径最大值 `35/38/43 ms`。RK2206 调度不再是
  4--6 秒 age 的候选根因。
- 权威无敏感摘要位于 RK3568
  `/var/lib/lsmv2/experiments/g3s-v7-g3b4-live600-20260806-004205.json`，monitor SHA-256
  为 `d71eeda6ce079f2b79bb0a9de1dc38ab95376c99c24ea9e75be19394d86ab824`。下一步保持
  传输参数不变，只做无遮挡 RF 复测或单节点隔离，并核对 UM220 内部修正应用/GGA age
  口径与上游观测历元。
- 现场脚本已支持 `require-stats-version=7`，分段归因脚本新增可选第 4 参数
  `aggregation=1..4` 且默认仍为 4；非法值在修改环境前拒绝。测试结束后反向 SSH 通道
  离线，但离线前已再次确认 fail-closed、服务 active 和 `NRestarts=0`；恢复远程通道后
  先做只读复核，不重复 600 秒窗口。

### RK3568 Stage Attribution And G3S V7 Immutable Release (2026-08-05)

- 在保留参数完全不变的 600 秒窗口中，RK3568 caster 到 field-write P95 约
  `1121 ms`，串口写 P95 约 `158 ms`；caster CRC、field 写、poll timeout、schema
  和交织错误均为 0。网关只解释约 1.1 秒，不能解释 GGA correction age 6--7 秒。
- 已实现向后兼容 `G3S V7`：916 B 按需载荷、934 B 完整线框，V1--V6 不变，Compact
  V6 常规遥测不增加字节。三个 14 桶直方图分别记录完帧到出队、UART 写入、完帧到
  UART 写完；session/模式切换清零，fail-closed 后保留最后会话供定向查询。
- 编码器、TypeScript 和 Python 均先校验固定 schema/桶数/边界，再验证样本总数与最大
  值所在桶；畸形计数和越界桶数负例已覆盖。计数到 `UINT32_MAX` 后整体冻结，保持三端
  不变量一致。
- field-gateway `75/75`、TypeScript build、ESLint、RK2206 C99 主机测试、Python 自检
  和 `git diff --check` 均通过。实现已由 clean 提交
  `107597851b99ac8a745978adfe8a0f0aeaced668` 推送并生成唯一不可变 A/B/C 包：
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_g3s_v7_latency_diag_rs485_gnss_hardware_live_20260805`。
- manifest SHA-256 为
  `2a91850732fdf4e414c3fdc3dee8439065f761a59b8bcf27b83cdefe8d81fb41`；A/B/C `.img`
  分别为 `e903d565ff764c7114690364ac29261644d4a37665415289d679076dd35f284a`、
  `0d22fd4373d801c6611514073a705a4e41bcb7053ca8ea32a98d43e5b879dfd8`、
  `f399eea340b0f4af8503b7887792ef194703707a89e0fce7fb95ac890e968c4f`。发布安全确认
  clean source、hardware GNSS/RS485、最终 PC0 校准、boot DISABLED、LIVE capability、
  V7 marker 和唯一身份；尚未烧录或真机验收，不能宣称 correction-age 根因已定位。
- RK3568 保持 `NTRIP_ENABLED=false`、runtime probe、聚合数 1。保留参数仍是
  `RTCM32_GGB / G3B=4 / burst=4 / guard=600 ms / correction-window=2500 ms /
  observation=1 Hz`，专业位移门禁仍关闭。
- 600 秒分段归因脚本在正常退出、异常和信号中断时都会恢复备份，并强制
  `NTRIP_ENABLED=false`、runtime probe、聚合数 1；已在 OpenHarmony 容器内通过
  `bash -n`，不会把实验聚合数 4 遗留到场外运行状态。

### G3B v1 600-Second Three-Node Reconvergence (2026-08-05)

- A/B/C 已烧录正式 G3B v1 包，legacy G3R、聚合 2、聚合 4 PROBE 均通过。聚合 4
  的 60 秒窗口用 38 个 XLS1 外层帧承载 100 个内层片段，三节点接受计数一致，全部
  CRC、重组、队列、UART 写、轮询、schema 和交织错误为 0。
- `AUTO` 因三节点保持 GGA=2 且 age P95 约 16 秒被拒绝；`RTCM32_GGB`、聚合 4、
  burst 4 的首次 180 秒窗口在最后 120 秒令三节点全部 `13/13 GGA=4`，但 age P95/
  max 为 6 秒。burst 8 没有改善 age 且使 A/B 后段 FLOAT，已拒绝。
- 200 ms observation coalesce 在真实流上零触发；实验组和 coalesce=0 对照的 180 秒
  窗口均保持 FLOAT、链路零错误。因此该代码和部署均已撤回，不增加无现场收益的
  生产参数。
- 等待两分钟连续跟踪后，以保留参数运行 600 秒：A 约 4 分钟 FIXED，约 6 分钟后
  A/B/C 全部 FIXED，最后 120 秒均为 `12/12 GGA=4`，最终 age 为 `4/4/4 s`。普通
  轮询 `102/102`，有效 caster 帧 1868、内层 RTCM 写 1058、外层 field 写 508，
  全部错误门为 0。
- A/B/C 最后 120 秒 age P95/max 均为 7 秒，并非全程 trusted/eligible；专业门禁
  仍失败，禁止建立 ENU 基线。权威报告为
  `/var/lib/lsmv2/experiments/g3b4-rtcm32ggb-reconvergence-live600-20260805-20260805-222313.json`，
  monitor SHA-256
  `9ea9cb7f7cc96a54c2c09115dcf8b7aa85b45591758197dccebf82950f813be8`。
- 结束时 RK3568 已恢复测试前稳定构建、NTRIP false、runtime probe、聚合数 1；服务
  active、`NRestarts=0`。下一步只做 correction-age 分段归因，不重复已拒绝的 burst、
  AUTO 或 coalesce 参数。

### 0.5 Hz Observation And G3B v1 Candidate (2026-08-05)

- 调整天线摆放后的双观测组 `0.5 Hz` LIVE 连续观测 `300 s`。最后 `120 s` 内
  A/B 持续 `GGA=4`，C 全程 `GGA=5`；A/B/C 接收修正片段约为
  `1514/1515/1533`。网关 CRC、UART 写、普通轮询、schema 与交织错误增量均为 0。
  C 没有少收修正，故其未 Fixed 不能归因于共同网关漏发；优先检查 C 独立的天线
  摆放、遮挡/多路径、接收机状态和收敛条件。
- 同一窗口 correction-age P95 仍约为 A/B/C `10/9/7 s`，不满足专业门槛
  `P95 <=3 s`、`max <=5 s`；因此 `0.5 Hz` 只作为诊断结果，不作为生产厘米级验收。
- 已实现 `G3B v1` 聚合：一个外层 field-link 帧装入 `2..4` 个完整旧 `G3R` 片段，
  RK2206 先校验完整外层边界及所有内层 G3R，再接受任一片段；写失败时网关按原顺序
  全量回队。field-link 上限继续由 RK3568/RK2206 共同强制为 `1024 B`。
- burst 预算按外层 field-link/XLS1 帧记账，一个 G3B 只消耗一个预算；健康状态分别
  暴露 `rtcmFieldFrameWrites` 与内层 `rtcmFragmentWrites`，并明确
  `accountingUnit=field-link-frame`，避免把聚合后的两个片段误算成两个空口包。
- 兼容门禁固定为默认 `RTCM_MAX_FRAGMENTS_PER_FIELD_FRAME=1`。必须先部署新网关但
  保持 NTRIP 关闭和聚合数 1，三节点全部烧录新镜像并通过旧 G3R PROBE 后，才可切到
  `2` 做 G3B PROBE；禁止旧节点与 G3B 混跑，也禁止直接切 LIVE。
- 实现与本轮记录已由 clean 提交
  `d4a7155547d3d7dc6e84d36b3fbc6d9fed170030` 推送。field-gateway `71/71`、
  TypeScript build、ESLint、RK2206 C99 主机测试及关键发布/引脚/轮询/锁顺序/快照门禁
  均通过；敏感扫描未发现 CORS 账号、端点或明文 NTRIP 密码。
- 正式 A/B/C 包位于
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_rtcm_batch_v1_rs485_gnss_hardware_live_20260805`。
  manifest SHA-256 为
  `11afc1f4c835c9267afc8cb3753d881a050baa69700a3b9683f61cf2dd494a6f`；A/B/C
  `.img` SHA-256 分别为
  `450a8d3a62714fae6f771729fcf6745d077ac4e83f1653594b81584167ed958a`、
  `3d42289066e70eda27c212093fc83c2cc3de499c1008f41c3580523f81598fd8`、
  `5405d02c463333d8779c223e04dcd63a7935274826badd23d6e48d56035abfc1`；loader 为
  `761d90888aa376156d562abf267dfe324b96c4397f7a601f6b4c64d0ea3bf977`。
  独立发布验证确认 `sourceDirty=false`、唯一 A/B/C 身份、真实 GNSS/RS485、逐节点最终
  PC0 校准、Compact V6 layered、LIVE capability 与 boot DISABLED，7 个清单文件全通过。

### Three-Node RTK FIXED Candidate And Safe Stop (2026-08-05)

- A/B/C 已烧录 LIVE 候选固件
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_gps_uart_rx_drain_v2_live_candidate_20260805`。
  对应实现已由提交 `bd356416` 推送到 `origin/feat/gnss-rtk-v31-transport`；但该现场
  目录生成于提交前，尚未从该 clean commit 重建和复验，仍不能称为正式生产发布。
- RK3568 网关新增节点 LIVE 证据 `45 s` 有效窗、每轮最多 `4` 个 RTCM 帧及 burst 后
  `600 ms` 轮询保护。field-gateway 的 `62/62` 测试、TypeScript build 和 ESLint 均通过；
  最终远端构建哈希为 `index.js=10b2a7c0c99c14a1ced72a0d95f7cfa66ca57a546f111dea0f4df5cb0712e562`、
  `rtcm-downlink-controller.js=3a3044f1b962688911d1aca96a3b27c6b04b158aa914a82d4a36053049e6103b`、
  `rtcm-poll-burst-gate.js=432a4d1b072bec76dc25f350a9dc7c0a5f451b2ba5a2feb1fa2b9f6aa38041b`。
- `4 frames + 600 ms guard + 45 s evidence` 真实 CORS LIVE 连续运行约 7 分钟：NTRIP
  一次连接即为 `ICY 200 OK`；普通遥测 `111/111` 轮完整、零 poll timeout；下发
  RTCM `348` 帧，caster 输入 `2112` 个有效帧且 CRC 错误为 0；RTCM 串口写错误、
  schema/interleaving 错误均为 0，三节点授权持续 `3/3`。
- A/B/C 最终都达到 `quality=4 / RTK FIXED`，卫星数约 `32/32/34`，HDOP 均约
  `0.55`。这证明三套 UM220、RK2206、XLS1 与 RK3568 共享差分链能够同时进入 FIXED，
  但观测到 correction age 约 `10 s`，且 `rtk_trusted=false`、
  `rtk_displacement_eligible=false`；因此尚未通过专业厘米级位移门禁，禁止建立 ENU 基线。
- 参数对照结果已收敛：`1000 ms` 轮询、`6 frames/250 ms`、`4 frames/250 ms`、
  `4 frames/1200 ms` 均因授权下降、轮询超时或后半段回落 FLOAT 被拒绝；当前只保留
  `4 frames/600 ms` 候选。最终报告在 RK3568：
  `/var/lib/lsmv2/experiments/ntrip-live-guard600-accepted-final-20260805.json`、
  `ntrip-live-guard600-seg1-20260805.tsv`、`ntrip-live-guard600-seg2-20260805.tsv`。
- A 已完成最终 G3S V6 查询：UM220 UART 锁定 `115200`，`read_errors=0`、
  `fifo_drop=0`，GNSS、土壤温湿度/EC、倾角均有效；报告为
  `/var/lib/lsmv2/experiments/ntrip-live-guard600-node-A-final-20260805.json`。B/C 最终
  G3S 查询因现场收设备尚未执行。
- 收设备前 RK3568 已恢复 fail-closed：`NTRIP_ENABLED=false`、
  `RTCM_RUNTIME_MODE=probe`、`RTCM_FRAGMENT_DATA_BYTES=512`、轮询 `250 ms`、audit
  cadence `2`；field-gateway `active`、`NRestarts=0`，环境文件为 `root:root 0600`。
  用户已在下雨风险前收回 A/B/C，2026-08-06 重新室外上电前不再进行现场操作。

### Hardware GNSS UART Drain Fix And Real Qianxun PROBE (2026-08-04 23:37..23:57 CST)

- 三节点已烧录本轮 UART drain 修复包
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_gps_uart_rx_drain_v2_20260804`；
  A/B/C 镜像 SHA-256 分别为
  `3e79d80d47622755e296c218ad9c46f5c7ffa0dcf8fb409c747cc8f4baad570c`、
  `4ea16adf82681e31e1afd240db75aa4ca07cc0994e24a8fda99004f7caaccbf3`、
  `38392a66d3abb081a752a266fdc011f111ef3b74f8c080d77c49b875ccb90291`，
  唯一固件标记为 `fw-rk2206-rtk-compact-v6-gps-uart-drain-v2-20260804`。
- 修复把 UM220 UART 单次读取从 `64 B` 提高到 `256 B`、轮询从 `10 ms` 缩短到
  `2 ms`，并在 UART 任务中直接流式解析 NMEA，不再等待最长约 2.4 秒的 RS485
  采集周期消费 FIFO。通过云服务器 `127.0.0.1:22079` 反向 SSH 在 RK3568 定向读取
  G3S V6 后，A/B/C 均为 `state=locked_primary`、`active_baud=115200`、`switches=0`、
  `reconfig_fail=0`、`read_errors=0`、`fifo_drop=0`；GGA/RMC 持续增长，证明共同问题是
  RK2206 接收调度而不是 PB6/PB7、UM220 默认波特率或三块 GNSS 硬件。
- 真实 CORS PROBE 使用受保护环境文件启动，账号和坐标未写入 Git/本记录。连接一次
  成功，状态为 `ICY 200 OK`，首个累计窗口收到 `80113 B`、534 个有效 RTCM 帧，
  caster 侧 CRC/帧错误为 0；三节点同一 session `allTargetsArmed=true`，普通 P1/P3/P4
  遥测同时保持三节点完整、零 poll timeout、零 schema/interleaving/write error。
- `RTCM_FRAGMENT_DATA_BYTES=160` 首轮以节点端零计数为基线，A/B/C 最终计数完全一致：
  `acceptedFragments=102`、`completedFrames=63`、`probeValidatedFrames=63`、
  `probeValidatedBytes=6365`、CRC/重复/拒绝/队列丢弃/UART 写错误/实际 GNSS 注入均为 0；
  但每节点 `expiredAssemblies=10`，因此 160 B 多分片方案严格拒绝，不能据此进入 LIVE。
- 随即仅把测试会话分片上限改为双方已支持的 `512 B`，审计 cadence 临时改为每 2 轮，
  以同一批三节点做真实 CORS 对照。网关窗口为 22 个 frame/22 个 fragment、零写失败；
  相对上一快照，A/B/C 都一致增加 `acceptedFragments +36`、`completedFrames +36`、
  `probeValidatedFrames +36`、`probeValidatedBytes +4073`，并且
  `expiredAssemblies +0`、CRC/重复/拒绝/队列丢弃/UART 写错误/实际注入均为 0。
  该短窗证明 512 B 单分片方向有效，但尚未替代 60/600 秒严格 PROBE 门禁。
- 原始报告仅保留在 RK3568：
  `/var/lib/lsmv2/experiments/ntrip-real-probe-gateway-20260804.json`、
  `ntrip-real-probe-final-{A,B,C}-20260804.json`、
  `ntrip-real-probe-512-gateway-20260804.json` 和
  `ntrip-real-probe-512-final-{A,B,C}-20260804.json`。现场配置备份为
  `/opt/lsmv2/backups/ntrip-real-probe-20260804-234300/field-gateway.env`。
- 结束时已完整恢复 fail-closed 配置：`NTRIP_ENABLED=false`、GGA source A、audit 60、
  fragment 160，环境文件 `root:root 0600`；field-gateway `active`、`NRestarts=0`，
  串口/MQTT 正常且 A/B/C 持续发布。A 当时只有 NMEA 流但 GGA quality 0、无有效定位，
  B/C 为 quality 1；因此未启用 LIVE，也不能声称已获得 RTK Fixed 或厘米级位移。

### Hardware-GNSS V6 Release And Fail-Closed CORS Staging (2026-08-04)

- 正式硬件 GNSS 发布包位于
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_protected_p1_rs485_gnss_hardware_live_20260804`，
  来源为干净且已推送提交 `eb76454b2bb15204e24934d8fc387128cb3f1c19`。manifest
  SHA-256 为 `19cb4cc34c9b3b089fb1b0ba0b7f70843917ef78702ac73d52adda63d70691cc`；
  A/B/C `.img` SHA-256 分别为
  `56dc3e25cf5ba36dc8f4969d6cca959912baca5cf046a435aae13780aa165e08`、
  `1e99db87854c68156b848ce66bbd81b20c0467ef2a2ad0fce0fd8e02d47fc7a9`、
  `b24370a2ddb07d013165466a855b276f60f6de7de848bd764da34caced455126`。
- 7/7 manifest 文件已独立复算长度与 SHA-256；三个 `.img` 均只命中自身 UUID 和
  `FIELD-NODE-A/B/C` 标签，包含真实 UM220 PB6/PB7 UART、真实 RS485、最终 PC0
  校准、protected-P1、`boot=DISABLED capability=LIVE` 标记，不含 simulated、
  PROBE-only 或 DISABLED-only 标记。固件每次重启或租约过期都返回 disabled。
- RK3568 已在不启用连接的情况下预配置本次 CORS 参数；原文件备份为
  `/opt/lsmv2/backups/ntrip-preconfigure-20260804-202843/field-gateway.env`。环境文件
  仍为 `0600 root:root`，网关重启验证为 `active/running`、`NRestarts=0`，健康状态
  为 `ntrip.enabled=false`。已额外显式固定 `RTCM_RUNTIME_MODE=probe`、三节点 mask、
  90 秒租约和 `160 B/160 ms` 边界，避免以后启用 NTRIP 时落入程序默认 LIVE；变更前
  备份为 `/opt/lsmv2/backups/ntrip-probe-safety-20260804-203816/field-gateway.env`。
  本记录不含账号、密码、端点、原始 RTCM 或真实坐标。
- 当前门槛是用户按物理标签烧录三份硬件 GNSS 镜像。烧录后先在室外、CORS 关闭
  状态执行 60/600 秒真实 GNSS 纯遥测；通过后才运行共同有限 PROBE，再切有限 LIVE，
  最终要求持续 `GGA=4`、差分龄 `<=5 s`、可信 GST 及 1800 秒三节点混合负载。

### Compact V6 Protected-P1 Indoor Gate Passed (2026-08-04)

- C 重新插稳后，20 秒高频 P3 复核为 `12/12` 完整 core round、零 profile/协议
  错误；5 个 environment 响应覆盖 A 2、C 2、B 1，C 电池与土壤三合一全部
  恢复有效。该人为加重 P3 的小样本仅因 B arrival P95 `2621.7 ms` 超过正式
  `2500 ms` 而整体 false，不作为生产门禁；报告 SHA-256
  `99a458b545f5c3addcc4f9bbcb97520377f62582ec9d88ac8127465358d683c1`。
- 随后使用正式 30/60 扩展 cadence 分别完成独立 `60 -> 600 -> 1800` fail-fast：
  60 秒 `46/46`、600 秒 `508/508`、1800 秒 `1419/1419` 完整 core round；三段的
  decode、wire length、unmatched、duplicate、recovery redundant、scope、epoch、
  profile、sequence 和 trailing bytes 全部为 0，且没有发送 P2。
- 60/600/1800 报告 SHA-256 分别为
  `b9f9cbae345deb2d10fd8c3942708233308f64df2c7b659adfd8f63b256a7565`、
  `bb7d663983451db3a403248bcac1e6eb0506060d1576a0e81e794831c8812ae7`、
  `f39a1fa9fb62b6d68a5097a0a685975424a174670279f4a3226ed7dcf68eca52`；
  对应 summary SHA-256 为
  `2ce6c03a682906297e4376b8b7c04282b61f9e8aa67528c3b61645ec0ad4cb34`、
  `9b3bde6a6a1ee9b3cac91e8e6745cfcecfd012fca96efe4358689e0366a13472`、
  `c8847c2e3063221a9b531641fd0e657650a9056e712e8f94f9ab063f95a57beb`。
- 600 秒 A/B/C arrival P95 为 `1577.5/1552.2/1350.7 ms`，P3/P4 各 9 帧并
  各节点覆盖 3 次。1800 秒 arrival P95 为 `2095.0/1868.7/1810.2 ms`，command
  P95 为 `1063.4/1387.7/1051.5 ms`，command max 为
  `3454.7/3157.9/1479.2 ms`；P3 `25/25`、P4 `24/24`，三节点均覆盖，全部满足
  `2500/2500/6500 ms` 门槛。
- 验收后 RK3568 field-gateway 已恢复 active、`NRestarts=0`、runtime hold clear，
  `NTRIP_ENABLED=false`。结论限于“真实 RS485 + 最终校准电池 + 模拟 GNSS + RTCM
  disabled”的室内传输门禁通过；不能表述为硬件 GNSS、RTCM LIVE、室外 Fixed 或
  厘米级位移算法已通过。下一阶段必须从同一 clean source 生成独立 hardware-GNSS
  V6 包，再按纯遥测 -> PROBE -> LIVE -> 室外持续 GGA=4 推进。

### Compact V6 Protected-P1 Short Gate: Link Pass, C Battery Blocks (2026-08-04)

- Hybrid 600 秒只有 `472/473` 完整 core round，出现 4 个解码错误、109 个恢复
  冗余/重复响应并发送 113 次 P2。修正验收记账后的 120 秒对照虽为 `93/93`，
  但 20 次 P2 无一次早于原 P1，反而形成 17 个冗余帧和 3 个真重复帧。因此
  hybrid 已停止，正式路线由提交 `4ea5b7ea4df98828309983a60caf988578d540c8`
  收敛为受保护的单 P1：P2 关闭，A/B/C 完整即提前关闭，否则最多保护 6500 ms，
  轮后静默 250 ms；节点 P1 去重深度为 256。RK3568 对 unmatched、duplicate 和
  recovery-redundant 调度帧只计数，不更新节点状态或发布 MQTT。
- 用户已按标签烧录并上电最终包
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_protected_p1_rs485_gnss_simulated_20260804`。
  manifest SHA-256 `beb376f7ac33207466925f0af69a127b8b2b5960967145c9c5e1782cdc85a7eb`；
  A/B/C 镜像 SHA-256 分别为
  `318e85277accc650e8210439442e86996b269379039358afd9fca82d7a618c7b`、
  `37363ce6628babc1cb0227a2c250d72e75b7c8aee5f0bacf333671db413cb9f6`、
  `d91c117d723f2555b2c76ad563e0f3a3dd9d1bff8eacf36eb27e613d9be7b8a2`。
  包已通过 A/B/C clean build、身份、真实 RS485、最终 PC0 校准、模拟 GNSS、
  RTCM disabled 和 `46 B payload/64 B wire` 发布门禁。
- RK3568 当前为 `compact-layered-v1/partial-retries=0/session=6500 ms`，NTRIP false，
  服务 active、`NRestarts=0`；部署前回滚点为
  `/opt/lsmv2/backups/compact-v6-protected-p1-predeploy-20260804-174627`。上电后的生产
  被动窗口已见 A/B/C 持续发布，未见 timeout、交织、unmatched 或 duplicate。
- 首次正式 60 秒得到 `51/51` 完整轮、零通信/profile 错误，A/B/C arrival P95
  `1490.4/1366.6/1347.4 ms`，但验收器因 60 秒内未自然到达第 60 轮 P4 cadence
  而误判失败。报告 SHA-256 `4470c34ba407e2f33e0f46c4cf0c8c80466bc01c7c7754dc97b5e99c4b16637a`。
  提交 `2f1a2614` 让每一阶段在有效 core 后明确验证一次 P3/P4，再恢复 30/60
  正常 cadence；板端脚本 SHA-256
  `c4bcd6fe9e722cee1dd95a31590c458b4e68bdf6ee4da0f4d0231dc1ab0c229e`，回滚点
  `/opt/lsmv2/backups/compact-v6-acceptance-probe-predeploy-20260804-175839`。
- 修正后 60 秒仍为 `51/51`，所有通信、线框、scope、epoch、序号和延迟门禁通过；
  A/B/C arrival P95 `1521.3/1375.4/1397.7 ms`，command P95
  `517.7/786.2/1048.5 ms`。唯一失败是 C 的 environment 帧 `validFlags=14`：
  土壤温度/含水率/EC 有效，但 `battery_v/battery_pct/quality=null`，形成 4 个同源
  profile violation。报告 SHA-256
  `4aecfd564ffda0bf6e66ad59b1654762104606c791b51a5f99f490f3f5de2336`。
- 30 秒高频 P3 复核为 `23/23` 完整轮、零通信错误；8 个 environment 响应覆盖
  A 3 次、B 2 次、C 3 次，A/B 全有效，C 三次都只缺电池并累计 12 个同源
  violation。报告 SHA-256
  `ad7cec49760f645ecad90dcb8f27ebf6d5146087916cac191a0387721c1579b3`。
  这证明当前链路和 RS485 短门禁通过，整体门禁被独立的 C PC0/SARADC 路径阻断；
  不进入 600/1800 秒，也不允许缓存旧电压或降低门槛。下一步只测 C 上电时 PC0
  对 GND，100k/27k 分压在约 11.5 V 电池下应约 `2.44 V`，再区分载板分压/焊点
  与 C 核心板 PC0/SARADC/插接故障。

### Compact V6 Field Gate Rejected; Hybrid Candidate Ready For Clean Build (2026-08-04)

- 原 V6 P1 60 秒通过，但 600 秒只有 `438/453` 完整 core round，并出现 4 个解码
  错误和 9 个同 tag 重复响应；两组 `79+49=128 B` 证明重复 64 B 帧交织。
  纯 P2 在 1 ms 冷却的 60 秒对照为 `168/168`、P95 `1.36..1.41 s`，但分层
  600 秒 arrival P95 上升到 `3.28..3.39 s`，即使只缺 1 个 core 响应仍因速度拒绝。
- `P2 高频 + P3/30 + P4/60` 的 90 秒对照为 `61/61` 完整轮，所有线框、scope、
  epoch、profile 和序号门禁为 0 错误，P95 `2108.4/2303.0/2341.0 ms`。因此不再
  重复广播/P2 参数试验，进入 P1 正常路径 + 去重 + 缺失节点 P2 恢复。
- RK2206 当前源码在响应前缓存最近 8 个 P1 并忽略重复；RK3568 初始 1500 ms
  窗口后对缺失节点发送新 P2 tag，逐节点单飞，最多一个恢复 pass；会话总保护
  6500 ms，但健康轮三帧齐全时立即关闭。P3/P4 正式 cadence 为 `30/60`。
- C99 host、field-gateway `58/58`、field-gateway lint/build、Python 金值/语法、
  发布安全正反例、轮询节奏/TX 顺序/快照门禁已经通过。clean/pushed 源提交为
  `c78ad6f3779499ab1ddf5f6d1e3055e13908c1ed`；immutable hybrid 包在
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_hybrid_rs485_gnss_simulated_20260804`，
  manifest SHA-256 `38f9b8c4aea295f700d5cff9dd28492212a8dba14f02bb6ec4e551fba09d25e5`，
  A/B/C 镜像 SHA-256 分别为
  `10385b69fc04798d1e27ce9a44cd911e0555d9610ffe30192abf6581531d25c3`、
  `e331872aad407fb708921d3405d77325331e99fbb962b683b372547eaba104f5`、
  `3770876c367ea03174dfa7364f50c0a6952171aed3ead8312ec5973a90c0f4f1`。
- RK3568 兼容代码与验收器已预部署，备份为
  `/opt/lsmv2/backups/compact-v6-hybrid-code-predeploy-20260804-162844`，远端哈希与本地
  一致，服务 active/NRestarts=0；环境尚未启用恢复，保持旧 V6 值。下一恢复点是用户
  按 A/B/C 标签重刷上述三份镜像，然后切换 hybrid 环境并立即执行 60 秒门禁。

### Compact V6 Layered Offline Candidate (2026-08-04)

- V5 已冻结为“充分保护时无损但速度失败”的诊断基线。当前分支实现 V6
  `compact-layered-v1`：P1 A/B/C core 广播时隙 `0/340/680 ms`，P3 environment
  每 3 个完整 core round，P4 audit 每 15 个且优先；三类 payload 均为 `46 B`，
  完整 field-link 线框均为 `64 B`。
- core/environment/audit 通过非零 `sample_epoch` 绑定。RK2206 扩展复用最近 core
  原子快照并独立递增 seq；RK3568 错 scope fail closed 且串口丢失清空调度窗口；
  telemetry-writer 只合并同 epoch scopes，并以 core + seq/epoch rollback + 更新的
  receive time 识别重启后清空旧 shadow。
- 对抗性复审额外修复两项：ClickHouse 批量失败后的逐消息隔离现在从批次前基线
  只重放实际插入成功消息，避免 DLQ 层污染 `device_state`；C/TypeScript/Python
  三端统一拒绝 V6 保留 `seq=0`。telemetry-writer 当前 `18/18` 已通过。
- 室内真值保持真实 RS485 土壤/EC/倾角、真实校准电池、模拟 GNSS 和 RTCM/NTRIP
  disabled。Windows 继续消费服务器既有展平字段，不需要新增字段映射。
- 本轮离线门禁已完成：RK2206 host/safety 与 V3/V4/V5/V6 发布正反例通过；A/B/C
  `hb build -f` 全部通过，dirty 编译证据目录为
  `output/rk2206-compact-v6-layered-dirty-compile-20260804`，release verifier 按设计因
  `sourceDirty=true` 拒绝；field-gateway `58/58`、telemetry-writer `18/18`、API
  `10/10`，三处非 API lint、Desktop UI production build、Windows WPF Release、
  Python 金值/语法/V6 dry-run、PowerShell parser、Bash parser、补丁格式和敏感信息
  审计均通过。API 全仓 lint 仍有 68 个不在 V6 改动文件中的既有错误，作为公开
  基线缺口保留，不伪称通过。
- V6 实现提交 `af0c6e519ef8294fdda74ff5f1e79b280cd4ef05` 已推送；正式 prepare
  在同一 clean HEAD 上重跑安全门禁和 A/B/C 全量构建，并生成唯一室内包
  `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_layered_rs485_gnss_simulated_20260804`。
  manifest SHA-256 为 `ff5191ba5d3908ea38c6cc4d24a90013707b0d15fa5a13bac98d8615bc1f3039`；
  A/B/C `.img` SHA-256 分别为
  `3bda38a61d29461f5bb66f8b6c81a31bee5500fcecf04181e55de1148c769c38`、
  `930903f03f6b6368e99f9321aab561e9941cc168cf557ce1c6a65aa6f510936f`、
  `138312e9c1cfa2bbde8911aabd4f776e95c852427128bb9d6dabac68845aa367`。
  独立复算确认 `sourceDirty=false`、hardware RS485、simulated GNSS、RTCM disabled、
  final battery calibration、`46/64 B` 和 layered cadence `3/15`。下一恢复点是按物理
  标签烧录这三份正式 `.img`，再执行 `60 -> 600 -> 1800` fail-fast；尚未烧录或真机
  通过，三阶段前继续关闭 CORS/RTCM/NTRIP。

### Compact V5 Live Gate: Lossless With Guard, Cadence Rejected (2026-08-04)

- 用户已按标签统一烧录正式 Compact V5 并上电。RK3568 运行快照确认 A/B/C 均为 `compact_payload_version=5`、hardware RS485、simulated GNSS、field-calibrated battery、RTCM `disabled + READY` 且 error summary 为 0；三节点真实 soil/EC/tilt 当前有效。
- 原正式 60 秒门禁只做 500 ms 排空且使用 3000 ms 保护窗，结果为 `37/39`、2 个 decode error、1 个 unmatched。两条坏记录精确为 `207 B + 49 B = 256 B`，等于两个 128 B V5 完整帧，证明迟到帧仍可交织；首个 unmatched C 帧证明开始时还有生产轮询残留。报告 `/var/lib/lsmv2/experiments/xls1-compact-v5-0060s-20260804-121326.json` SHA-256 `ce14e28bd15961284c03a50689419721cd5b0ac8d52f678879b1b94f86b03e70`，summary SHA-256 `5481e5e2a0cc3b03980122a08bb33cfb3afe946979ca55b3dfb33a2cd8ecae05`；fail-fast 未进入 600/1800，服务自动恢复。
- 单变量改为“最长 30 秒排空、连续 5 秒静默、6000 ms 接收保护”，同时保留 command P95 `<=1500 ms` 和 per-node arrival P95 `<=2500 ms`。60 秒为 `63/63`、21/21 完整批次，零丢失、解码、交织、未匹配、重复、profile 和序号错误；A/B/C command P95 `1334.9/1292.4/1374.9 ms`，但 arrival P95 `3419.8/3400.0/3645.4 ms`，所以仅因更新节奏严格失败。报告 SHA-256 `aeb3b55b540b47112e169be70a4b0c33ebf9f957d2bc369abd9921de6da5f047`。
- 同参数 600 秒通信层为 `621/621`、207/207 完整批次，零丢帧、解码、交织、未匹配、重复和序号错误。C 仅 1 帧倾角无效，形成 4 个同源 profile reason；A/B/C command P95 `1836.4/2101.2/2093.9 ms`，arrival P95 `5377.9/5498.2/5757.7 ms`，严格失败并停止，不进入 1800 秒。报告 `/var/lib/lsmv2/experiments/xls1-compact-v5-drain5s-guard6s-0600s-20260804-122133.json` SHA-256 `3fa30b49a9bab884341ae01d57e23ce977906ecf3adb32f717a183af28535e3f`。
- 结论必须分层表述：V5 在充分排空和 6 秒防碰撞窗下已证明 600 秒南向通信无损，但当前三节点 P2 串行轮询无法满足 2500 ms 更新间隔，且长测有一次真实倾角瞬态，因此整体验收仍失败。下一协议候选应让每个高频业务线框落在 XLS1 单个 `<=64 B` 标称会话包内，并按“高频位移/倾角核心 + 低频环境/完整审计扩展”分层；未完成字段契约、跨端组装、发布门禁和离线审查前不再次烧录。
- 验收器提交 `ae2371b6` 已将默认排空改为 5 秒连续静默/30 秒上限、保护窗改为 6000 ms，性能门槛不变；生产配置提交 `c4c9289b` 同步把 targeted 保护窗改为 6000 ms。RK3568 验收脚本备份 `/opt/lsmv2/backups/acceptance-drain-predeploy-20260804-122346`，环境回滚点 `/opt/lsmv2/backups/targeted-guard6s-predeploy-20260804-123356`。现场环境仍为 `root:root 0600`、NTRIP false；配置后生产 60 秒为 `96/96`，A/B/C 各 32 帧，零超时/交织/拒绝/写入/发布错误，服务 active、`NRestarts=0`。

### Compact V5 Candidate And Powered V4 Baseline (2026-08-04)

- 用户确认 A/B/C 已上电。RK3568 `192.168.124.179` 上的 field-gateway 为 active、`NRestarts=0`、MQTT connected，保持 `compact-targeted-v1/250/3000/0` 与 `NTRIP_ENABLED=false`。运行快照确认三节点仍是 Compact V4、hardware RS485、simulated GNSS；三节点土壤三合一、三轴倾角和 field-calibrated PC0 电池当前均有效。
- 不抢占串口的 60 秒生产窗口为 `119/119` 轮询匹配，A/B/C 分别新增 `40/39/40` 帧；schema reject、decode/rejected、interleaving、publish failure、poll timeout、command write failure 和服务重连增量均为 0。该结果只证明当前上电与短时链路健康，不推翻同一 157 B V4 已在 600 秒复现 `793/813` 和双帧交织的拒绝结论，也不是 V5 验收。
- Compact V5 候选完整保留 V3 的 95 B 专业字段，并以 15 B RTCM 摘要形成 `110 B payload / 128 B complete frame`。C/Python 黄金向量、RK2206 host、field-gateway `51/51`、telemetry-writer `15/15`、Windows lint/production build、26 源引脚正向/3 负例、发布安全 V3/V4/V5、RS485 启动、TX 顺序、轮询节奏、电池三套门禁及 `git diff --check` 已通过。
- 实现提交 `4320616a364d30f1d76096dd91f16cb3e57d9dc7` 已推送。唯一正式包为 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v5_rs485_gnss_simulated_20260804`，manifest SHA-256 `045b27c68acc6dc33ff0342a52ea294c1252dd383aff23f8a4c31b7efbcba734`；A/B/C `.img` SHA-256 分别为 `55fee7080deefdc7351549a375823f776220d9e40308b9c5f418c748751c2653`、`b79d0850ffb920f084fd4e0fb037273d74639d5c2c98cbc51b74bf949a2f9de6`、`2529f3adb99103ea0757b969f3e94632f61b5a06e09e03fdd17daec6a56fba56`。独立复核为 clean source、V5 110/128 B、hardware RS485、simulated GNSS、RTCM disabled、P2 singleflight 和 A/B/C final battery calibration。
- RK3568 已原子部署 V5 decoder 与三份验收脚本，回滚点 `/opt/lsmv2/backups/compact-v5-predeploy-20260804-120352`；服务重启后 active、`NRestarts=0`、NTRIP false。部署后兼容现有 V4 的 15 秒窗口为 `13/13`，A/B/C `4/5/4`，零 schema/rejected/interleaving/timeout/publish 错误。下一步只需用户按物理标签统一烧录正式 V5，再运行 V5 `60 -> 600 -> 1800`；三阶段通过前继续关闭 RTCM/CORS。

### V5-r4 157 B Shared-Link Rejection (2026-08-04)

- A/B/C 已统一烧录 V5-r4。60 秒首级 `111/111` 且 A/B/C arrival P95 `2072.4/1902.7/1901.8 ms`；600 秒为 `793/813`，20 个缺帧与 20 个解码错误组成 10 组 `236+78=314 B` 的双帧交织，A/B/C arrival P95 均约 3.8..4.0 秒，因此 fail-fast 未进入 1800 秒。
- 三节点 G3S V5 均确认 U4 和真实 soil/EC/tilt 当前健康、final fail/streak 为 0。生产 1200 ms 窗口在 549 次轮询中产生 90 次 timeout 与同型交织；3000 ms 保护窗短测 `99/99` 且零协议错误，证明迟到帧撞上下个 P2 是直接触发条件。
- RK3568 已以备份 `/opt/lsmv2/backups/targeted-tail-window-predeploy-20260804-104141` 为回滚点，切为 `compact-targeted-v1/250/3000/0`，NTRIP 仍关闭；验收独立保留 1500 ms command max 和 2500 ms per-node arrival P95，不把保护窗当性能门槛。
- 正式复跑 `57/57` 全帧完整但 arrival P95 `4449.2/4470.6/5121.5 ms`；15 秒完全静默排空后再测仍为 `60/60`、`4972.4/5380.6/4985.7 ms`，所以不是旧队列残留。手册明确无线载荷标称最多 64 B、理想单向约 900 B/s 且双向/同信道/距离/干扰会下降；157 B 正常帧至少占三个空口包，当前根因是周期帧尺寸与共享链路吞吐。
- 下一步不是继续调 timeout。设计并离线审查一个 `wire <=128 B` 的快速周期帧：保留全部专业 RTK 与真实传感器字段，把 V4 的 44 B RTCM 审计尾部压缩为必要运行状态；完整累计诊断保留在按需 G3S V5。通过 C/Python/TypeScript 金值、字段 fail-closed、引脚/发布安全和 A/B/C clean build 后，再让用户统一重刷一次并重新执行 60/600/1800。

### RS485 Diagnostic V5-r4 Poll Cadence Fix (2026-08-04)

- V5-r3 真机前置门禁通过，但两次 60 秒严格门禁分别为 `90/90` 和 `78/78` 全量匹配、所有批次完整、零通信/profile/重发错误，却因 arrival P95 超过 `2500 ms` 失败。首轮仅 C 为 `2557.7 ms`；复跑 A/B/C 为 `2640.0/2699.8/2675.8 ms`，因此未进入 600/1800 秒且不能放宽门限冒充通过。
- G3S V5 证明三节点 soil/EC/tilt 当前全有效、最终失败与连续失败均为 0；约 500 周期只见 A tilt 3、B EC 1/tilt 6、C soil 1/tilt 1 次低频无响应，全部一次补读恢复，且无 CRC/短帧/地址/功能码/写入错误。故 P95 阻断不是节点离线或传感器损坏。
- RK3568 G3S 工具已从只支持 V4 的旧版本原子升级为 V5，SHA-256 `2672f2f7ac9c7def01e6274a6d896f0ffb696ecaf22a21cd1afa33443d6d4bd2`，备份 `/opt/lsmv2/backups/g3s-v5-probe-predeploy-20260804-094703`；三次诊断后 field-gateway 均恢复 active/NRestarts=0。
- 源码确认 `POLL_REQUEST_CHECK_INTERVAL_MS` 和启动摘要均声称 50 ms，但 `DataUploadTask` 实际硬编码 200 ms。V5-r4 让轮询模式真实使用配置的 50 ms，并新增静态门禁；2500 ms、RS485 retry、139/157 B、RTCM disabled 和 XLS1 参数均未改变。
- 发布复核同时发现构建器曾独立硬编码 V5-r3，现改为从 `landslide_main.c` 读取唯一标记，只派生 compact v3/v4 token，并新增来源门禁。实现提交 `a6bb102f3f89eb50b72e08fc01922065d555cc31` 已推送；完整离线回归、A/B/C clean build 和独立发布复验通过。
- 唯一下一次烧录目录为 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_rs485_diag_v5_r4_gnss_simulated_20260804`，marker `fw-rk2206-rtk-compact-v4-rs485-diag-v5-r4-20260804`，manifest SHA-256 `481b0805c67b91e99041a3c7543eb62dafeceb431c8da492fd0fbc0978e7b94b`；A/B/C `.img` SHA-256 为 `1b0443d3ba92195dbc95d52566ad758a5068514b2010c13a8441b5b74e3f3c84`、`755325733db20efdf748636617acc5fe6d3063a1ad059dc0d326b5509ddd0065`、`16f17fb91d5867c3cd7a68b78ac8bc3a36bc005a0d51782ab5a65d6c931b7dd6`。尚未重新烧录或完成 V5-r4 60/600/1800 秒。

### [Superseded] RS485 Diagnostic V5-r3 Adversarial Audit and Clean Release (2026-08-03)

- 正常 Compact V4 上行仍为 `139/157 B`；G3S V5 是按节点请求的 `552 B` 诊断 payload，C99 金值完整帧 `570 B`，不会周期上传。V5 分离 soil/soil-EC/tilt/rain 的 attempt、retry recovery、final failure、skip、streak、最近状态/时间和采集时长；EC backoff 不再覆盖最近真实失败。
- 已修复 I2C read failure 被误报外部 timeout、SC16IS752 UART cache 在 reset/漂移后失真、健康启动无条件长扫描、扫描喂狗、U4/RS485 降级日志互相矛盾、扫描状态误判，以及 field-link 在 TX mutex 外分配序号造成的并发乱序。序号分配、COBS/CRC 编码和完整分块发送现为同一临界区，并有静态发布门禁。
- C99、Python、field-gateway `49/49`、build/lint、26 源引脚/3 负例、发布安全正反例、启动/扫描/TX 顺序安全、电池三套拒绝路径及 A/B/C OpenHarmony 全量编译均通过。提交 `b6b49adbbfe0601570bb87b292d29f736c6a44ac` 已推送远端。
- V5-r3 历史目录和哈希只保留追溯；该包已被 V5-r4 取代，禁止继续烧录。其真机两次 60 秒均因 P95 性能门限失败，未进入 600/1800 秒。

### R3 Targeted Link Tuning Gate (2026-08-03 22:00 CST)

- A 的 XLS1 重置后，25 秒生产窗口连续发布 `seq=29..38` 共 10 帧，A 超时 0、协议错误 0；同窗 C 为 11/11，B 仅 3/11。随后运行态日志确认 A/B/C 均可发布，但 B 仍间歇出现独立 `P2B` 1200 ms 超时。RK3568 前置门禁继续通过：环境文件 `root:root 0600`、`NTRIP_ENABLED=false`、`/dev/ttyS3` 正常、网关 active。
- 正式参数 `compact-targeted-v1 / 250 ms cooldown / 1200 ms response / 0 retry` 的 60 秒 R3 基线失败：33 轮应有 99 帧，实际 90/99；A 33/33、B 24/33、C 33/33。24 轮完整、9 轮部分、0 空轮，三节点已收序号均连续，解码/profile/未匹配/重复/残帧错误全为 0。B 成功响应 P50/P95/max 为 `405.7/652.1/671.8 ms`，远低于 1200 ms，说明增大等待窗不能解释缺失。报告 `/var/lib/lsmv2/experiments/xls1-compact-v4-0060s-20260803-215135.json`，SHA-256 `98803efd41d4345e006775bc804ec9379f895803871a5841e90dda8d1905ed3d`。
- 单变量把 cooldown 从 250 ms 提高到 500 ms 的 60 秒对照同样失败且更差：总计 62/78，A 26/26、B 11/26、C 25/26，只有 10/26 完整轮；因此拒绝 500 ms，不把它写入生产配置。报告 `/var/lib/lsmv2/experiments/xls1-compact-v4-0060s-20260803-215522.json`，SHA-256 `63a7125920f00f789ce90004a482ca2dde19ae59255d158f2beb01dce7b898f1`。
- 为排除 A/C 竞争，在保持同一 P2、250/1200、真实 RS485、模拟 GNSS、RTCM disabled/clean 门禁下运行 B-only 60 秒：B 为 42/63、缺 21，匹配率 66.67%；成功响应 P50/P95/max 为 `424.8/620.5/653.2 ms`，序号 `585..626` 连续，零解码/profile/未匹配/重复/残帧错误，传感器与电池均有效。21 个空轮最长连续长度仅 1，证明即使 A/C 完全不参与，B 仍稳定呈现约三分之一下行命令未被执行；报告 `/var/lib/lsmv2/experiments/xls1-compact-v4-b-only-0060s-20260803-2159.json`，SHA-256 `9693a2ec957aeb7eaf3eab8131bd031e2679df3e524ae59a3157c30d60f8cdc9`。
- 用户将 B 移近后，同参数 25 秒生产窗口 B 为 12/12、零超时，随后 B-only 60 秒严格门禁为 86/86、零缺失/协议/profile/序号错误；报告 `/var/lib/lsmv2/experiments/xls1-compact-v4-b-only-0060s-20260803-2210.json`，SHA-256 `540601c5cc9b360a1576bdd63a6cd2669b982ba3a7507904a18c5d2ec3506418`。服务恢复后的第二个 25 秒三节点窗口 A/B/C 各 15/15、零超时，证明此前 B 的 42/63 主要由距离/摆放引起，而不是 B 固件或 RS485 传感器故障。
- 当前位置用 1200 ms 响应窗重跑三节点 60 秒得到 76/78：一组晚到响应形成 `236 B + 78 B = 314 B`，对应 2 个解码错误。B/C 完整成功响应最大分别为 1318.9/1323.9 ms，已超过 1200 ms；因此 P2 单飞机制正确，但当前窗口不足以覆盖真实空口尾延迟。报告 `/var/lib/lsmv2/experiments/xls1-compact-v4-0060s-20260803-220809.json`，SHA-256 `e8dbfae200238d2e577abf3c0772a13cea164f65c6083dd583bf5a1d121c6002`。
- 只把行为响应窗提高到 1500 ms 后，通信层达到 87/87、29/29 完整轮、零丢帧/解码/交织/未匹配/重复；但旧验收器在 targeted 模式仍使用 `ABC/BCA/CAB` 轮换，与生产网关固定 `A->B->C` 不一致，并把每节点到达 P95 人为拉到约 4 秒。提交 `999960e6` 将 P2 验收顺序修为固定 A/B/C，增加回归断言并推送；RK3568 部署文件 SHA-256 `32b7fec390dd7da064957d774faf0f91df4aedb0dc4df8e73da46a1d1d39df2a`，部署前备份 `/opt/lsmv2/backups/targeted-fixed-order-predeploy-20260803-221428`。
- 修正后的固定顺序 1500 ms 门禁通信层再次达到 102/102、34/34 完整轮，零通信错误；A/B/C 到达 P95 为 2177.3/2161.9/2365.6 ms，均低于 2500 ms，证明固定顺序既符合生产实现也满足速度目标。门禁仍因 A 的 1 帧倾角无效而失败；上一轮同类瞬时无效发生在 C，之后均恢复，说明当前剩余阻断是偶发 RS485 倾角快照有效位，不是 XLS1 通信。报告 `/var/lib/lsmv2/experiments/xls1-compact-v4-0060s-20260803-221449.json`，SHA-256 `15628d89b640136ca3379b03b8875b1a000adb5ac4b2636ac1098bc1e9a1ebb2`。
- 当前结论与恢复提示：B 距离问题已关闭，1500 ms 是通信层候选但尚未写入生产；RK3568 生产服务已恢复 active，仍保持 `compact-targeted-v1/250/1200/0` 和 NTRIP false。下一步先定位 A/C 偶发倾角无效的发生时刻及 RS485 读取状态，确保 60 秒内零 profile violation；之后用固定顺序 `1500 ms` 重新通过 60 秒，才原子切换生产响应窗并进入 600/1800 秒。原始 JSON 只保留在 RK3568，不提交 Git。

### Deferred RS485 Startup Diagnostics Fix (2026-08-03 21:15 CST)

- B 在重新烧录 `r2` 的正确 V4/B 镜像后，调试串口确认版本已为 `v1.3-um220-rs485-rtk-compact-v4`，SC16IS752 地址 `0x4D`、A/B scratchpad 和双通道内部 FIFO loopback 全部通过，但输出固定停在 `[OK] RS485 Modbus initialized via SC16IS752`，没有 `--- Initialization Complete ---`、任务启动或 `[FW MARK]`。RK3568 同期持续正确发送 `P2B`，数分钟内 `...0002` 回包仍为 0；A/C 可继续发布，因此不是 RK3568 串口、P2 单飞或 B 供电问题。
- 根因是 `FieldRs485_Init()` 在 `SYS_RUN(MainEntry)` 的调度器启动前调用 `RunReadOnlyDiagnostics()`。诊断读超时依赖 `LOS_TickCountGet()` 和 `LOS_Msleep()`；此时 LiteOS tick 尚未运行，无响应的第一个外部 Modbus 请求会永久等待。SC16IS752 内部自检通过只证明 U4/I2C/FIFO，不能保证外部探头会立即响应，因此该启动顺序违反 fail-open 要求。
- 源码修复将 `FieldRs485_Init()` 收敛为纯硬件初始化，并新增 `FieldRs485_RunDiagnostics()`；传感器任务在调度器启动并保存首个正常快照后只调用一次扫描。即使两路 RS485 探头均断开，UART RX、命令处理和上传任务也能先启动，B 仍可用真实电池与明确标记的室内模拟 GNSS 响应 `P2B`，扫描继续使用原有有界超时并最终恢复 4800 baud/默认时钟。
- 新增发布门禁 `scripts/firmware/test-rk2206-rs485-startup-safety.ps1`，强制初始化函数不得调用扫描、扫描入口必须保留 read-only probe、调用位置必须在 `SensorData_StoreSnapshot()` 之后且不得位于 `App_SystemInit()`。主机 GNSS/Compact V4 测试、PB 引脚安全门禁和新启动安全门禁均通过；B 的完整 OpenHarmony `hardware RS485 + simulated GNSS + RTCM disabled` 编译通过。编译验证目录 `output/rk2206-b-startup-fix-compile-20260803` 来自 dirty source，只用于编译证明，禁止烧录。
- 修复提交 `7675fb267fc99f010ebe01eba233a87fabae43e4` 已推送到 `feat/gnss-rtk-v31-transport`。正式 immutable 包为 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_rs485_hardware_gnss_simulated_targeted_v1_r3_20260803`，manifest SHA-256 `53898f9f2bbf7c27eb4f03d908b304855bbc5b69e9c0cb4eaeab13fa3e5e81cc`；A/B/C `.img` SHA-256 分别为 `3782d9777e32890226829480f9ccdf97058f82c10d3e623b1af8ccdae40cc23c`、`77be90947703c1a92fa4ffeee6ada96168b167d0b8677193c58e9c21332acfb9`、`61cf709b2e0eeb12c804f359ad9f85a8da8c4a587a30050218c9ca192f2d460f`。独立发布门禁确认 `sourceDirty=false`、A/B/C 唯一身份、hardware RS485、simulated GNSS、RTCM disabled、逐节点 field-calibrated PC0、139/157 B 和 P2 singleflight。
- B 烧录 R3 后真机启动闭环通过：RK3568 首个 30 秒窗口连续发布 B `seq=2..26` 共 25 帧，零断号、零 `P2B` 超时和零协议错误。随后 15 秒短诊断报告 `/var/lib/lsmv2/experiments/xls1-compact-v4-0015s-20260803-213004.json` SHA-256 `f3c80cbb888de5b87392b4fe32b46105833b29aeae95da7e155ed01e4e03d9f2`，9 轮 27/27、A/B/C 各 9/9、零缺失/解码/profile/未匹配/重复/残帧错误；B 同时给出有效土壤三合一和三轴倾角快照（31.6 C、0.0%、0 us/cm、2.21/0.37/0.00 deg），证明此前没有可归因到某个传感器损坏的证据，启动卡死可由任一瞬时 Modbus 无响应触发。短诊断 `stableProfile=false` 仅因 15 秒窗口内 A/B/C 到达间隔 P95 为 `3482.4/2970.2/3132.3 ms`，超过 2500 ms 时序门槛；不是传感器有效性或丢帧门禁失败，正式结论仍需同源 R3 A/B/C 后重跑 60/600/1800 秒。
- 现场下一步将 A/C 也统一到同源 R3，随后重新从严格 60 秒开始；60 秒同时满足零丢帧和 P95 时序门槛后才进入 600 秒，不能沿用修复前或本次 15 秒诊断的门禁结果。

### Compact Targeted Singleflight Checkpoint (2026-08-03)

- A/B/C 旧 Compact V4 室内镜像在真实共享 XLS1 上完成了两轮诊断，但未通过验收。60 秒报告 `/var/lib/lsmv2/experiments/xls1-compact-v4-0060s-20260803-190546.json` 的 SHA-256 为 `882f4d02405167cae11e4e03d1d87f035cabad6ee85bdb4c65c3c7205335d1e9`，28 轮应有 84 帧、实际匹配 0、解码错误 62。30 秒报告 `/var/lib/lsmv2/experiments/xls1-compact-v4-0030s-20260803-191221.json` 的 SHA-256 为 `7ab2baa4ce99b46965ef3b7e64eb38a7a5c6fa7b7b53462f081d0671a2c90694`，观察到 26 个完整 157 B 帧和 4 组 `236 B + 78 B = 314 B` 的两节点分块交织。该证据确认身份、139 B payload 和模拟 GNSS 标志正确，同时证明 P1 广播下多个 RK2206 的 32 B UART 分块会互相穿插；继续增大固定时隙不能从机制上保证不交织。
- 南向协议新增向后兼容的 `compact-targeted-v1`：RK3568 发送 `P2<节点><8位十六进制 nonce>`，只有目标节点立即响应，网关必须以 `last_command_tag` 收到对应完整 157 B 帧或超时后才轮询下一节点。旧 `P1` 广播及 A/B/C `0/340/680 ms` 时隙只保留作回退。正式参数为 `SOUTHBOUND_POLLING_INTERVAL_MS=250`、`SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS=1200`、`SOUTHBOUND_POLLING_PARTIAL_RETRIES=0`；RTCM/NTRIP 在室内阶段保持关闭。
- `1f1f461df51c9be36cbda1dbac0b2f00cabc738d` 实现 P2 单飞、RK3568 轮转/命令标签匹配、现场脚本和 RTCM-disabled READY 桩；`05fd4a2a3eacb3515edb4f7fef718c996bf0383f` 修正发布清单，使 V4 明确记录 `compactPollProtocol=compact-targeted-v1`、命令 11 B、field-link 29 B、节点时隙 0。两次提交均已推送到 `feat/gnss-rtk-v31-transport`。完整离线回归为 RK2206 C99 host 通过、C/Python 金值通过、Python 编译通过、field-gateway 48/48、lint 通过、pin safety 26 源文件与 3/3 负例通过、release safety 正反例通过。
- 当时唯一可烧录候选为 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_rs485_hardware_gnss_simulated_targeted_v1_r2_20260803`；该历史包后来先被 V5-r3、再被顶部 V5-r4 状态取代，不得用于下一轮。原 manifest 和节点哈希仅保留作历史追溯。
- RK3568 `192.168.124.179` 已部署兼容 P1/P2 的最新 field-gateway 和两份现场脚本，远端哈希与本地一致；部署前备份为 `/opt/lsmv2/backups/compact-targeted-predeploy-20260803-194041`。`lsmv2-field-gateway.service` 当前 active，串口与 MQTT 已重连，`/etc/lsmv2/field-gateway.env` 仍为 `root:root 0600`、`NTRIP_ENABLED=false`、`SOUTHBOUND_POLLING_MODE=compact-broadcast-v1`。保持 P1 是为了让尚未重刷的旧节点继续可见；当前日志中的 RTCM state 拒绝、236/78 B 交织和广播超时属于旧镜像的已知预期失败，不是新 P2 的验收结果。
- 当前唯一阻断是现场重新烧录：必须按物理标签使用上述 `r2` 目录内 A/B/C 对应 `.img` 全部重刷并上电。完成后先原子切换 RK3568 到 `compact-targeted-v1/250/1200/0`，执行 prerequisite 和 60 秒门禁；60 秒完全通过才运行 600 秒，600 秒完全通过才运行 1800 秒。当前不能声称真实 RS485 稳定通过，也不能进入室外真实 GNSS/RTCM 阶段。
- 用户随后确认 A/B/C 已重刷 `r2` 并上电。RK3568 已在备份 `/opt/lsmv2/backups/compact-targeted-env-20260803-203804` 后原子切换为 `compact-targeted-v1/250/1200/0`，NTRIP 仍为 false、环境文件仍为 `root:root 0600`；前置检查通过。首轮 60 秒严格门禁按预期失败即停，没有进入 600 秒：报告 `/var/lib/lsmv2/experiments/xls1-compact-v4-0060s-20260803-203851.json` SHA-256 为 `e83eba916b30f44b1692df4f3f453d96f163a05985f991d6aff394b88a72f9f3`，总计 47/75；A 为 25/25、B 为 22/25、C 为 0/25。所有已收帧均为 Compact V4、真实 RS485、模拟 GNSS、RTCM disabled/READY-only 且全部 RTCM 计数为 0；解码/profile/未匹配/重复/残帧错误均为 0，A/B 已收序号连续。P2 已从机制上消除广播分块交织，但 C 的定向链路完全无响应，B 还有 3 次原始请求丢失。服务已自动恢复 active，生产轮询继续稳定发布 A/B 并持续记录 C 的独立 1200 ms 超时；下一步先确认 C 的供电、XLS1 天线/网络配置和串口启动身份，再评估 A/B 的有界定向重试，不能以提高轮询频率掩盖离线节点。
- C 现场调整后于 20:46:55 开始以正确 `...0003` 身份连续返回。第二轮 60 秒报告 `/var/lib/lsmv2/experiments/xls1-compact-v4-0060s-20260803-204719.json` SHA-256 为 `a4d65632a57752a3ace7e233627edeebb745f99a5f2152955d90809c2e5ee56e`，A/C 均为 26/26、序号连续、真实 RS485 字段有效，C 命令时延 P50/P95/max 为 `384.7/591.8/656.1 ms`；但 B 同轮变为 0/26，因此总计 52/78，仍未进入 600 秒。全轮仍为零解码/profile/未匹配/重复/残帧错误，证明 C 已恢复且 P2 不存在固定“只能两个节点”的协议限制；当前应先确认调整 C 时 B 是否下电、天线/连接被移动或 XLS1 状态改变。

### Indoor RS485 Hybrid Source Checkpoint (2026-08-03)

- 用户已完成两路 RS485 硬件接入，当前任务恢复 active。室内包使用真实 XLS1、真实 SC16IS752/土壤三合一/三轴倾角、真实逐节点 PC0 校准，并以编译期 `GnssSourceMode=simulated` 禁止 UM220 PB6/PB7 初始化和 RTCM capability；此配置不能产生 RTK Fixed、厘米级或专业位移证据。
- 固件、RK3568、服务器和 Windows 已贯通 `gnss_source`。模拟 GNSS 会双层 fail-closed：RK2206 清除全部可信 RTK/时标/差分/Fixed 证据，RK3568 拒绝矛盾 trusted 帧并设置 `rtk_displacement_eligible=false`。严格现场脚本新增 `--required-gnss-source simulated`，其 dry-run 锁定 `hardware RS485 + simulated GNSS + RTCM disabled/clean + 60/600/1800 s`。
- 审查修复了 RTCM capability 完全关闭时 age 桩返回 0 的问题；现在从未发生的 fragment/completed/action age 均为 `UINT32_MAX`，并有独立 C99 测试。相关结果：C99 协议/电池/GNSS/禁用 RTCM 全通过，pin safety 26 源文件通过，release safety 正反例通过，Python 金值通过，field-gateway 46/46，writer 14/14，API 10/10，Windows lint/build 通过。API 全仓 lint 的 68 个既有错误不在本次改动文件中。
- A/B/C dirty 候选 OpenHarmony 全量构建成功，manifest 正确报告 `fieldSensorMode=hardware`、`rs485HardwareInitialized=true`、`gnssSourceMode=simulated`、`gnssHardwareInitialized=false`、RTCM disabled 和 A/B/C 最终校准。最终二进制包含真实 RS485 标记、无 GPS UART 初始化标记且身份唯一；由于 `sourceDirty=true`，候选严格禁止烧录。待源码干净提交并推送后再生成正式发布目录与哈希。
- 正式打包的第一轮安全验证拒绝了“disabled capability + 遗留 LIVE 显示标记”的矛盾，未生成最终目录。`baf7e8ecfc052cbb57bcdc83902c16c7ed29ac5b` 将 capability marker 改为由编译宏派生并移除打包器对字符串的二次改写；单节点及三节点 OpenHarmony 全量重建均通过，二进制明确含 `boot=DISABLED capability=DISABLED`、模拟 GNSS、SC16IS752/RS485，且不含 GPS UART 初始化或 PROBE/LIVE capability 标记。
- 可烧录正式包为 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_rs485_hardware_gnss_simulated_20260803`，绑定已推送提交 `baf7e8ecfc052cbb57bcdc83902c16c7ed29ac5b`。manifest SHA-256 `cf18a8b9c86457f47ccd692150ae2d64a87125cb3181082657f504f6884a38b5`；A/B/C `.img` SHA-256 为 `256d5072...5f636`、`7d19be25...3ff31`、`beba41f1...4010c`。最终目录独立通过 `sourceDirty=false`、唯一身份、hardware RS485、simulated GNSS、RTCM disabled/无 runtime control、field-calibrated PC0 和 final acceptance 门禁。尚未烧录或运行真实 A/B/C 60/600/1800 秒，因此当前只完成“可开始调试”的发布准备。
- RK3568 当前地址为 `192.168.124.179`。field-gateway 的 `dist/index.js` SHA-256 与本地最新构建一致，现场验收脚本已在备份 `/opt/lsmv2/backups/indoor-rs485-predeploy-20260803-170053` 后原子更新。前置门禁确认 `/etc/lsmv2/field-gateway.env` 为 `root:root 0600`、`NTRIP_ENABLED=false`、`/dev/ttyS3` 存在且网关 active；前置检查不抢占串口，检查后服务仍 active。当前日志尚无 A/B/C 响应，符合“尚未烧录/上电正式室内包”的未验收状态，不能表述为真实 RS485 已通过。

### Current Verified Baseline (2026-08-03)

#### V4 Production Software Checkpoint

- V4 跨端正式固件实现由 `47cbddce3aab1d478087e45f95ff477f4a235d44` 构建，后续部署可复现性修正为 `c742b846`。离线门禁为 field-gateway 45/45、telemetry-writer 14/14、API 10/10、42 字段 writer 契约、Windows lint/production build/原生壳运行、RK2206 C99 主机协议与发布安全测试全部通过；差异扫描不含 CORS 密码、私钥或真实坐标。
- 正式三节点固件目录为 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_hardware_live_20260803_r2`，manifest SHA-256 `1ee3a5f8402cb64c9bcf5997cfbe53e4b7c4bf430765b98e90a498189c672e7d`。A/B/C `.img` SHA-256 为 `7b5e775e72e4f3f5a29c8c0810d53aaf0a3bbba99ca8c07de7fa4eb4c2f7b70a`、`a1ed7806ee3d2237097c61586783d5b757234099427f83660f6a8f2dd48bfa00`、`eb6a744306c09832ee4c6012232eb7bcc7d82b78664ef3fa39f95d7538054773`，loader SHA-256 `761d90888aa376156d562abf267dfe324b96c4397f7a601f6b4c64d0ea3bf977`。独立验证确认 `sourceDirty=false`、7 个预期固件文件、唯一身份、hardware RS485、最终电池校准 `1046565/1048458/993702 ppm`、139 B payload、157 B wire、LIVE capability、boot DISABLED 和有限 runtime lease control。非 `r2` 目录已被取代。
- RK3568 已部署 V4 解码/NTRIP/RTCM 控制器但显式保持 `NTRIP_ENABLED=false`；回滚目录为 `/home/linaro/lsmv2-backups/field-gateway-pre-compact-v4-20260803-021718`。服务 active、`NRestarts=0`、串口 open，所有 RTCM 写入计数为 0。C 仍持续上报旧 V2，A/B 无新帧，故现场并非真正三节点全下电；该事实不作为 V4 验收。
- 现场门禁缺口已在 `97473b62` 修复，`97a60d2a` 收敛旧版本诊断：批量轮询器现支持 V3/V4 与严格硬件/电池/RTCM 证据，新增 V4 60/600/1800 秒失败即停编排器。RK3568 部署的批量轮询器/编排器 SHA-256 为 `b4db5100...75d7a`、`d29b5171...a7ba`，最新回滚目录 `/home/linaro/lsmv2-backups/field-test-diagnostics-97a60d2a-20260803-031920`；无发送前置检查确认环境 `0600 root:root`、NTRIP false、串口字符设备和 active/零重启服务。
- 1 秒预期失败自测证明编排器会第一阶段失败即停、原子留档、删除 hold 并恢复服务；summary SHA-256 `dc8b03fc...421252`。该轮 A/B 无响应，C 却对当前 P1 和重发连续产生 V2 simulated 序号 `11458..11460`，所以 C 当前确有独立供电/未真正下电，烧录前必须处理，不能解释为旧健康快照。
- 生产服务器回滚目录为 `/opt/lsmv2-production/backups/server-pre-rtk-v4-20260803-0230`。V4 writer/API 镜像分别为 `sha256:b3f744437ded557f11902b05f32e327f65df61adb1d044c1aeafa06596809534`、`sha256:2d1ea4dea9a836974aec2739d3c1fe2e1d82848f92869b184c6d2de30da6da7c`；两者 running、`RestartCount=0`，ClickHouse 持续写入和 API health 均正常。现网 Kafka offset 显式提交与有效 GPS 保留热修复已保留。
- Windows 字段契约已统一到设备页、详情和 CSV：使用土壤温度/湿度/EC、三轴倾角、可信 RTK 与专业位移，删除空气温湿度、MPU6050 和旧 6 位坐标；仅 `rtk_trusted=true` 时显示 9 位 RTK 坐标，缺失值不再伪造为 0。便携包 `artifacts/windows/portable-rtk-v4-fields-20260803` 已通过原生壳 ready handshake 和 15 秒静置无错误门禁；exe SHA-256 `26c2c609755e0ab68188a4a7bec6333d9d47a10f20472c6069014c4ea6c683d8`。
- `c742b846` 删除了 `app_config.h` 中错误声称 MPU6050 使用 PB4/PB5 的历史注释，并将 RK3568 生产部署模板固定为已通过长测的 `1000/2500/1/1200 ms` 恢复配置；新增测试直接解析该模板并断言参数，网关回归由 44 增至 45 项。二进制抽查再次确认 simulated V3 含模拟标记但不含 SC16IS752/I2C 路径，hardware V4 `r2` 含硬件路径且不含模拟标记。全部引脚、负例、发布、电池及协议门禁重跑通过；这些后续修正不改变 `r2` 固件哈希。
- 从干净提交 `4b12eaab1483ac0883e2e87bd963ceedbe565476` 生成了同构 Compact V4 simulated 演练包 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_simulated_rehearsal_20260803`，manifest SHA-256 `771510d10093e2d85ad65b6d21fc9af44f67fd8348182725a4660aa94495b281`，A/B/C 镜像 SHA-256 为 `3a5c39d4...39ba1`、`c60f54c6...63907`、`24156b7b...b0ccc`。发布安全确认三节点唯一身份、field-calibrated PC0、139/157 B、LIVE capability 但 boot DISABLED，且 `rs485HardwareInitialized=false`；逐节点二进制均无 SC16IS752/PB4/PB5 路径。它与 hardware `r2` 共用相同 loader 和 Compact V4/RTCM runtime 契约，只允许在 RS485 接口未安装时做链路演练，不能作为真实传感器验收包。
- 当前检查点为现场阻断：所有仍可离线证明的原始目标项已经复核，但正式 Compact V4 hardware `r2` 尚未实际烧录到 A/B/C 并完成 60/600/1800 秒真实 RS485 门禁。解除条件只有三个：确认 C 不再由独立路径供电、按物理标签烧录 `r2` A/B/C 对应镜像、三节点同时上电；随后从 `--check-prerequisites` 恢复。没有这些现场动作，继续增加模拟或单元测试不能证明真实 157 B 链路稳定性。
- 明天的唯一推进顺序：核对 C 独立供电并按标签烧录 A/B/C -> NTRIP 仍关闭跑 V4 60/600/1800 秒纯遥测 -> 确认三节点同 session lease -> PROBE -> LIVE + 真实 CORS -> 室外 `GGA=4`、correction age、Fixed 连续性与厘米级 ENU 证据。任一前置失败都不得跳级，也不得把当前软件部署写成厘米级完成。

- `49eb7544` 已将常规上行升级为单个 95 字节 Compact V3 快照，完整 COBS/CRC 帧为 113 字节；移除 SHT30 和 MPU6050 字段，保留模拟 RS485 土壤/EC/独立三轴倾角、真实 UM220 GNSS、XLS1 与 PC0 电池。`deb0929d` 连同该实现已推送到远端 `feat/gnss-rtk-v31-transport`。
- 正式烧录包位于 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v3_final_simulated_20260803`，从干净提交 `deb0929dfc3f7412b665272a6424fc2dad35c5c2` 全量构建。manifest SHA-256 `fd917730d17bf4da4437df17c60f785780d4f1e79f55a9d9058c3427e4b49fab`；A/B/C `.img` SHA-256 为 `b71e130e...97afd`、`d3b9cee3...bcc5c`、`b306bb56...5eea`。发布验证和引脚门禁均通过：`sourceDirty=false`、7 个固件文件、唯一身份、最终校准 `1046565/1048458/993702 ppm`、RS485 simulated、`rs485HardwareInitialized=false`、RTCM disabled、PB4/PB5 hardware-only。
- RK3568 已部署 Compact V3 解码并以旧 V2 物理节点完成 25/25 轮向后兼容门禁；生产 telemetry-writer 已部署 V3 完整快照替换语义且持续写入正常。两者尚不能替代新 V3 镜像烧录后的 60/600/1800 秒真机门禁。

- A/B/C 已分别烧录 `xls1_link_rehearsal_battery_simulated_20260801` 对应身份镜像并同时上电。该包只模拟 RS485 土壤/EC/倾角，UM220 GNSS 与 PC0 电池采样保持真实；RTCM injection 仍为 disabled。
- RK3568 批量轮询与生产网关均保证同一串口最多一个广播会话在途。当前首响应窗 1200 ms，部分响应时同标签最多重发一次，总会话上限 2500 ms；会话关闭后冷却 1000 ms，全节点空响应才执行 2000..30000 ms 指数退避。调度与延迟统计使用单调时钟。
- 2026-08-02 600 秒严格门禁通过。报告保留在 RK3568 `/var/lib/lsmv2/experiments/xls1-three-node-batch-poll-20260802-004710.json`，SHA-256 为 `a1341efba950f8cd36e04b627078ec1741a559f41b78e1705fe4160ad2916a63`；共 310 轮、930/930 帧，A/B/C 各 310/310，三节点序号均连续覆盖 570..879，零跳号、零重复、零回退、零解码/profile/未匹配/残帧错误。A/B/C 最大命令延迟分别为 315.6/641.7/955.1 ms。
- 门禁通过 `/run` systemd drop-in 临时设置 `Restart=no`、`RefuseManualStart=yes`，并在 `finally` 删除覆盖、恢复服务；预存 hold 文件不会被误删。最终 `lsmv2-field-gateway.service` 为 enabled、active/running、`Restart=always`、`RefuseManualStart=no`、`NRestarts=0`。
- 最终 RK3568 `dist/index.js` SHA-256 为 `f66d5ed7165c8810248df4cd4bb7ba4f3e09a01ea96f7781893594ceae6bc3d8`；门禁脚本 SHA-256 为 `d4094733f8d363bb8d85e565e3779604df6a8ba08d460ec6e1363581011e8e9d`。主要回滚目录为 `/home/linaro/lsmv2-backups/field-gateway-pre-backpressure-20260802-002324` 和 `/home/linaro/lsmv2-backups/field-gateway-pre-monotonic-20260802-004521`。
- 重新上电后的在线复核同样通过：从健康快照 92 -> 185 个广播命令期间新增 93 轮、279 帧，恰为 `93 x 3`；A/B/C 序号各前进 93，最后一轮 3/3，空轮、重复、未匹配、解析拒绝和交织错误均为 0。
- 当前 `SOUTHBOUND_POLLING_INTERVAL_MS=1000` 表示上一轮关闭后的冷却时间，不是固定 1 Hz 启动周期；现场完整轮次约 1.94 秒。不得把当前结果表述为“严格每秒一轮”，也不得为了演示数字恢复重叠广播。
- 最终 1800 秒报告每节点均有 929 个电池样本：A 固定 10.997 V，B 为 10.967..10.982 V（中位数 10.971 V），C 为 11.770..11.771 V（中位数 11.770 V）。采样噪声已经足够低，但三节点均为 `default-calibration`；百分比仅供趋势展示，下一阶段仍需在同一采样窗口用万用表逐节点校准。
- 原始门禁报告不提交 Git，后续真实 GNSS 报告可能包含现场坐标；memory 与仓库只记录脱敏汇总、报告路径和哈希。
- 2026-08-02 尝试将完成后冷却从 1000 ms 单独降到 950 ms。报告 `/var/lib/lsmv2/experiments/xls1-three-node-batch-poll-20260802-011328.json` 为 15 轮、23/45 帧，A/B/C 分别收到 8/8/7 帧；三个节点所有已观测序号均连续，响应集中在早期连续通信阶段，随后三节点共同静默。脚本成功恢复正式服务后，网关又连续 4 轮为 0/3，随后 RK3568 `192.168.124.179:22` 本身从局域网离线；同网段扫描仅路由器开放 SSH。因此该轮被判为外部全链路中断污染，不能用于接受或拒绝 950 ms 参数，也不能继续测试 900/850/800 ms。
- 为防止同类误判，门禁报告新增 `batchCompleteness`：完整/部分/空轮、最长与尾部连续空轮、最后完整/最后有响应轮，以及 `simultaneousSilenceAfterHealthyTraffic` 事实标志。该标志不自动归因；候选参数失败后仍必须先复跑 1000 ms 基线并核对 RK3568 可达性。
- 4G 新卡于 2026-08-02 13:25 CST 完成注册、附着和 `cmnet` 建链。RK3568 到云服务器的主机路由及默认路由均已确认走 `usb0`（默认 metric 50），`wlan0` 仅保留 metric 600 的自动备用，未保留以太网默认路由；用户决定后续现场测试和正常运行固定以 4G 为主，不再人工在网线与 4G 之间反复切换。
- 2026-08-02 16:48 CST 更换大流量 SIM 后再次通过云端反向链路核验：蜂窝状态为 `modem_ready`，SIM/注册/附着/APN 均通过，RSSI 31；默认路由、云端主机路由、反向 SSH 和两条 MQTT 会话全部明确使用 `usb0` 的 `192.168.43.100`。`eth0` 保持 `never-default=yes` 和 metric 200，仅有本地网段路由；相关 timer/service 均已启用，后续禁止用人工插拔或反复修改默认路由进行常规测试。
- 云端反向入口 `127.0.0.1:22079/28081/28082/28087` 全部在线，云服务器观测到蜂窝公网出口会话。`field-gateway`、Hermes、反向 SSH 在测试结束后均为 active/running，MQTT connected；cellular guardian 状态为 `cloud_reachable_via_4g`，云端 `1883/8080` 的绑定设备 TCP 探测通过。
- 最新三节点门禁脚本 `/usr/local/bin/xls1_three_node_batch_poll.py` SHA-256 为 `86200419bb8d5f8efc535015523c594af0e62d28b07e0412cf86354aa79b3ba0`，默认仍为不重发，显式参数只允许 `0/1` 次。历史 1000/950/900/850/800 ms 结果用于定位；当前生产依据改为后续 1000 ms 有界重发三级门禁。
- 800 ms 的 1800 秒 4G 最终门禁真实失败：1021 轮中 1014 完整、7 部分、0 空轮，3056/3063 帧，匹配率 99.77%；A/B/C 分别缺 6/1/0 帧。三节点已接收序号仍完全连续，且重复、回退、未匹配、解码、profile 和残帧错误均为 0；A/B/C 最大命令延迟为 524.5/884.6/1010.6 ms。报告路径为 RK3568 `/var/lib/lsmv2/experiments/xls1-three-node-batch-poll-20260802-4g-800-final-1800s.json`，SHA-256 `9330bcddd2127d302a86783f5dfcb1b794ea3dcdd9c7d036c970b48ca97281bc`。因此 800 ms 被拒绝，生产保持 `SOUTHBOUND_POLLING_INTERVAL_MS=1000`，不为约 2.5% 的理论提速把 950 ms 推入生产。
- 800 ms 门禁退出后正式网关自动恢复。14:29 CST 健康快照已累计 118 轮、354 个三节点匹配帧，轮询超时 0，最近一轮 3/3，串口 open、MQTT connected；这证明服务恢复和 4G 业务链均正常，但不替代后续真实传感器/RTCM 门禁。
- 随后的 1000 ms、无重发 1800 秒对照仍出现 6 个低频逻辑缺帧：917 轮中 911 完整、6 部分，A/B/C 缺 `4/2/0`；三节点已收序号完全连续，协议/解码/profile/重复/未匹配/残帧错误均为 0，报告 SHA-256 `ba8315faa13e645647a87ded8cdb42ed193c1d64a7acb3ca5353f9d75620b7b1`。这排除了“只要恢复 1000 ms 就必然零丢帧”的假设。
- 同标签单次有界重发已完成强制、600 秒真实和 1800 秒最终三级门禁。500 ms 强制窗为 11/11 轮、33/33 逻辑帧；1200 ms 真实 600 秒为 310/310 轮、930/930 帧，1 轮重发（0.3226%）在重发发出后匹配缺失 A，最大逻辑时延 1503.8 ms，两个预期冗余帧独立归类；最终 1800 秒为 929/929 轮、2787/2787 帧、零错误且本轮不需重发。600/1800 秒报告 SHA-256 分别为 `fff4792c3b0f28ba4d5b09222ede60e0f8dc1d60107cd600f042ad6643ca2ceb`、`0cc143af8102924d80de0823ce99d3cbe072db2e288e52880f7c368bda66998a`。
- RK3568 生产网关已两阶段部署：先以默认重发关闭验证新构建正常，再原子启用 `SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS=2500`、`SOUTHBOUND_POLLING_PARTIAL_RETRIES=1`、`SOUTHBOUND_POLLING_RETRY_AFTER_MS=1200`。对抗性复核后又收紧为空窗口不重发、每节点最多一个预期冗余副本；当前回滚目录为 `/home/linaro/lsmv2-backups/field-gateway-pre-empty-retry-boundary-20260802-163637`，`index.js/config.js/compact-poll-retry.js` 哈希为 `849f0365...c15a67`、`903ffbb9...24f36`、`320f0b14...2a52a71b`。修正版重启后已重新累计 61/61 轮、183/183 帧，重发/重发写失败/超时/重复/未匹配/解析拒绝/spool 均为 0；串口 open、MQTT connected、A/B/C online，field-gateway/Hermes/反向 SSH active，4G `usb0` 仍为公网出口。
- 部署后累计复核到 536/536 个生产轮次、1608/1608 个逻辑匹配帧；A/B/C 各 536 帧且均为 online。重发、超时、重复、未匹配和解析拒绝均为 0，spool pending 亦为 0，串口与 MQTT 在线。该段证明生产集成未引入回归，不替代 600 秒门禁中已发生的自然补帧证据。
- 有界重发实现、Python 门禁、测试和上述部署证据已由 `06749252ac251f482498e099884140adbbc79ddb` 推送到远端 `feat/gnss-rtk-v31-transport`；敏感信息扫描未发现 CORS 凭据、私钥、真实坐标或原始报告。

### Historical Engineering Evidence

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
- 可复现源码提交 `cc5757e09b3f271126d3d0a4cddd19b38aebe0e8` 已推送到远端 `feat/gnss-rtk-v31-transport`。正式 A/B/C 模拟链路测试包已通过独立 staging 构建后交换到 `F:\2\openharmony\rk2206_firmware_releases\xls1_link_rehearsal_battery_simulated_20260801`，manifest 为 `sourceDirty=false`、RTCM injection disabled、RS485 hardware initialized false，A/B/C 均为明确的 neutral/default calibration。
- 最新正式包的 A/B/C `.img` SHA-256 分别为 `127c6b4d1de200602ec4eecab3bdd38ddc357b6756facb328b0e5c8f63a2793b`、`248f85a2e3ff2409c7bb6debb0bfaa20a34d291d805ee4918d7c8a6d456ed1db`、`c71b7c0d1442220f5fa1ce7a135ededcee3c7f7baded52c3952964e87c1d7fb8`。7 个 manifest 二进制哈希独立复算无差异，三个 `.bin` 均只包含自身 UUID/安装标签和 `SIMULATED (RS485 values only)` 标记，`SC16IS752`/`[RS485]`/`EI2C0_M0 PB4/PB5` 命中均为 0。
- RK3568 批量轮询工具已补齐 compact v1/v2 双栈、电池与模拟源解码、三节点严格 profile 校验、32 位序号回绕诊断和独立稳定性门禁。严格门禁要求 100% 命令匹配、三节点序号连续、零重复/未匹配/解码/profile 错误、无残留半帧、有效电池/模拟传感器数据及 P95/最大命令延迟达标；Python 语法、C/Python 金向量及正反门禁用例通过。该条记录生成时工具尚未部署；其后的部署和真机通过状态以本节顶部 2026-08-02 基线为准。
- PC0 校准链已支持 A/B/C 独立参数：严格报告新增电压中位数，`new-rk2206-battery-calibration.ps1` 只接受通信门禁通过、每节点至少 30 个电池样本、默认校准且采样期间波动不超过 150 mV 的报告，再结合三次同时万用表读数生成带来源哈希的校准文件。构建器逐节点写入 gain/offset/verified，manifest 保存映射并复制原始校准文件；即使增益恰为 `1000000`，已验证节点也正确报告 `field-calibrated`。
- 逐节点校准流程已用金值与失败路径测试，并用测试映射完成 A/B/C 全量 OpenHarmony 构建；随后同目录只构建 B，确认旧 A/C 产物被清理。B 验证包仅含自身 UUID，模拟标记存在，`SC16IS752`/`[RS485]`/`EI2C0_M0 PB4/PB5` 均不存在，固件与校准来源哈希零差异；SDK 临时备份已清理并恢复，`_verification` 产物也已删除，正式烧录包未改动。
- 校准改动后又只切 `-FieldSensorMode hardware` 完成 A 节点 OpenHarmony 全量构建；manifest 为 `fieldSensorMode=hardware`、`rs485HardwareInitialized=true`、默认校准未验证，二进制包含 A 身份及 SC16IS752/RS485 标记且不含模拟标记，manifest 哈希零差异。SDK 恢复、临时目录清理完成，证明接口到货后仍可通过单一构建参数回到真实采集。
- 2026-08-02 新增可复用发布安全验证器及自包含测试。验证器对 manifest 字段、文件集合/长度/SHA-256、A/B/C 的 `.bin` 与 `.img` 身份、跨节点污染、传感器源、RTCM 模式、PC0 输入路径和校准状态做强校验；测试证明可拒绝篡改镜像、重新计算清单哈希后混入错误节点身份、以及模式伪装。正式模拟包 `xls1_link_rehearsal_battery_simulated_20260801` 已以 `sourceCommit=cc5757e0...`、`simulated/disabled/default-calibration` 重新通过，主机四组测试、PC0 引脚门禁和校准生成器测试均通过。
- 2026-08-02 19:44..20:10 CST 完成 A/B/C 三个独立 PC0 同步窗口，均为 100% 完整三节点轮次和零协议错误。万用表 `VBAT_SW` 真值 A/B/C 为 `11440/11520/11520 mV`，中性固件中位数为 `10931/10906/11706 mV`，生成增益 `1046565/1056299/984111 ppm`。三份原始报告只保留在 RK3568 和非 Git `output/`，校准文件 SHA-256 为 `678f7c36e160e1e4259367ea40690dd4e87369b9c36ee77ac918d32f4192a87b`。
- 已从干净提交 `b084f10a...` 构建 `F:\2\openharmony\rk2206_firmware_releases\xls1_link_rehearsal_battery_calibrated_20260802`。包保持 RS485 simulated、RTCM disabled、PB4/PB5 不初始化，A/B/C manifest 均为 `field-calibrated`；三个 `.img` 哈希分别为 `92af5fde...bbd10a`、`d10a4b3a...a1dfff`、`25d2184c...732434`，发布安全、引脚和校准回归通过。烧录后 B 的同步复测证明原 B 增益未达到 60 mV 门槛，因此该目录中的 B 镜像已被后述候选取代；在该阶段 A/C 尚未完成同步验收，后续条目已闭环。
- `F:\2\openharmony\rk2206_firmware_releases\xls1_rs485_hardware_preflight_calibrated_20260802` 虽曾以旧校准文件通过发布安全门禁，但其 B 增益仍为 `1056299 ppm`，现已过期；继续严格 `DO-NOT-FLASH`，即使 RS485 元件安装完成也不得烧录。必须等 B 二次校准现场通过并完成 A/C 复测后，使用最终校准文件重建 hardware 包，再执行接口安装、断电和首次上电门禁。
- 2026-08-02 B 烧录首轮校准包后的修正版严格窗口为 31/31 完整轮、93/93 帧，零缺失、重发、解码、profile、重复、未匹配和残帧错误，`stableProfile=true`，服务自动恢复；报告保留在 RK3568 `/var/lib/lsmv2/experiments/xls1-three-node-battery-B-postflash-rerun-20260802.json`，SHA-256 `5cd603a251494125624e01e3e9b0d66508286aa6c7ebab2d5feb0068eb559085`。B 为 `field-calibrated`，31 个样本 `11584..11586 mV`、中位数 `11586 mV`；万用表首尾均为 `11500 mV`，误差 `+86 mV`，通信通过但电压精度拒绝。迭代工具从旧增益 `1056299` 计算 B 候选 `1048458 ppm`，候选校准 SHA-256 `ae7638c8e20efedbbbfb6c3bf1f2a6b20c36fefee892e91d0946c192d8536726`。干净提交 `f78aab76...` 的 simulated 候选包在 `F:\2\openharmony\rk2206_firmware_releases\xls1_link_rehearsal_battery_refined_B_candidate_20260802`，A/B/C 增益为 `1046565/1048458/984111 ppm`，B `.img` SHA-256 `5136225519aa6336a8cb979270214ff9c826c45265f9134874b18b7c9267b0f2`；包为 simulated、RTCM disabled、PB4/PB5 不初始化并通过 `RELEASE_SAFETY_OK`。RK3568 门禁报告现保存 `maxP95IntervalMs`，部署脚本 SHA-256 `099e6b197849c7e7db52ae6e2b83bda500e5710fbdec02b1f1da4dbef0a56ad2`，备份为 `/home/linaro/lsmv2-backups/xls1-three-node-batch-poll-pre-report-config-20260802-205256.py`。
- B 修正候选最终同步验收通过：严格窗口 31/31 轮、93/93 帧，`stableProfile=true`，所有通信错误计数为 0；B 的 31 个样本固定为 `11507 mV`，质量为 `field-calibrated`，同步万用表首尾均为 `11500 mV`，误差 `+7 mV`，满足 `<=60 mV`。接受 B 增益 `1048458 ppm`。RK3568 原始报告 `/var/lib/lsmv2/experiments/xls1-three-node-battery-B-refined-verify-20260802.json` 已下载到非 Git `output/rk2206-battery-calibration-20260802/`，两端 SHA-256 为 `a4fce627cdc1e371cedb217fa688191695f2afdd3db44309a720fbcbb35fc05e`。该阶段 A/C 尚待当前同步复测；旧 hardware 包继续 `DO-NOT-FLASH`。
- C 当前固件同步复测为 31/31 轮、93/93 帧、零通信错误，C 样本固定为 `11389 mV`，同步万用表首尾为 `11500/11500 mV`，误差 `-111 mV`，故精度拒绝。原始报告 `/var/lib/lsmv2/experiments/xls1-three-node-battery-C-verify-20260802.json` 已下载到非 Git `output/`，SHA-256 `bd8dfe5ce1dd50f6c3134831df99ca15d96843f231a29a6b8f79ce17cf277183`。迭代候选 C 增益为 `993702 ppm`，候选校准 SHA-256 `e0ee946dcf1a2ef11c113cf201106ae845d590036b3b6b1306b39aa1356eadb4`；只有重刷 C 并再次满足 `<=60 mV` 后才能接受。
- C 修正候选包从干净提交 `a7cf9fbb...` 构建在 `F:\2\openharmony\rk2206_firmware_releases\xls1_link_rehearsal_battery_refined_C_candidate_20260802`；C `.img` SHA-256 `b3b57903e68c5b1ff417e1b184b6cd95d2ae5a2babc0db74edc39003360979f7`，包为 simulated、RTCM disabled、PB4/PB5 不初始化并通过独立发布安全校验。烧录后严格窗口 31/31 轮、93/93 帧、零错误；C 样本 `11490..11492 mV`、中位数 `11491 mV`，万用表末值在 `11490..11500 mV` 间跳动，最坏绝对误差 `9 mV`，正式接受 C 增益 `993702 ppm`。报告 `/var/lib/lsmv2/experiments/xls1-three-node-battery-C-refined-verify-20260802.json` 已按 SHA-256 `055c62cc044136271901c82b7006825e3704efd426407f315433eb9eb84b26ff` 下载到非 Git `output/`。该阶段仅 A 尚未同步复测，下一条已完成验收。
- A 当前 `1046565 ppm` 固件最终同步验收为 31/31 完整轮、93/93 帧，零缺失、重发、解码、profile、未匹配、重复和残帧错误；A 中位数 `11429 mV`，同步万用表 `11420 mV`，误差 `+9 mV`，满足 `<=60 mV`。报告 `output/rk2206-battery-calibration-20260802/xls1-three-node-battery-A-verify-20260802.json` SHA-256 为 `7895dc62cda455607b6ec503e2f41e92e89d7c32451c9ae13ecd7e1d4ff185f7`。A/B/C 最终接受增益为 `1046565/1048458/993702 ppm`，三节点均通过。
- RK2206 OTA 只读审计确认当前板级 HOTA HAL 的写入、启动切换、重启、回滚和元数据接口为空操作或假成功，分区表/公钥为空，应用未链接 HOTA，现有镜像只有单 `liteos` 槽。现场 A/B/C 禁止 OTA，审计未写入或烧录任何节点；先在可有线救援备用板验证 A/B 引导链、签名、原子元数据、健康确认和掉电回滚，正式节点随后各需最后一次有线迁移。迁移后常规 OTA 通过软件重启，不需要人工下电。
- 正式电池验收文件 `output/rk2206-battery-calibration-20260802/battery-calibration-final-accepted-20260802.json` SHA-256 为 `73807fd83bd38cd132a680ab59421afe08817af78bfc7d3ebaf13f3c97841a3c`，绑定 A/B/C 各自最终 `31/31` 轮、`93/93` 帧、零错误报告、烧录包 manifest 和万用表端点。提交 `6025fa89bdb73d35bbd3c902e14927ac8f2e69ca` 新增 finalizer、算术复核及拒绝路径，并让两套官方 calibrated 打包脚本强制 `RequireFinalBatteryAcceptance`。
- 从该干净提交生成最终 simulated 包 `F:\2\openharmony\rk2206_firmware_releases\xls1_link_rehearsal_battery_final_20260802`，manifest SHA-256 `2dd57ca0a2c44f9fa35768a216621f962cc5c9fb031f9db4c8f4d72fc1e824ca`，A/B/C `.img` SHA-256 为 `b2048c5f...bea1d`、`078d742b...81f82`、`548a2dc7...680f8`；profile 为 simulated、RTCM disabled、PB4/PB5 不初始化。
- 同提交生成 hardware 预检包 `F:\2\openharmony\rk2206_firmware_releases\xls1_rs485_hardware_preflight_final_20260802`，manifest SHA-256 `bb71c9a6e4d86c1b62be9a8c3806d2a300af1a942283086554696f08ca2d2427`，A/B/C `.img` SHA-256 为 `0c0ce5a9...bbea6`、`8d3cc381...0ab48`、`736d8ce9...7c08f`；它包含 PB4/PB5 SC16IS752/RS485 路径并带强制 `DO-NOT-FLASH` 文件。两包独立复验、交叉模式拒绝、最终校准哈希和 loader 一致性均通过；共同 loader SHA-256 `761d90888aa376156d562abf267dfe324b96c4397f7a601f6b4c64d0ea3bf977`，构建工作树 clean。

## In Progress

- 正式 G3B v1 A/B/C 包已烧录；legacy G3R、G3B 聚合 2/4 PROBE 及 600 秒三节点
  FIXED 恢复测试已完成。生产候选只保留
  `RTCM32_GGB / G3B=4 / burst=4 / guard=600 ms / observation=1 Hz`。
- 当前阻断项仍是 correction-age 时效：RK3568 已将自身 P95 约束到 `1121 ms`，下一步
  用 G3S V7 真机量测 RK2206 完帧/出队/UART 写入，再与 GGA 输出对齐；不继续靠调整
  burst 猜测。
- G3S V7 不可变 A/B/C 包已经由 clean pushed commit 构建并通过发布安全门禁；当前只
  等按物理标签烧录，尚未取得节点侧 V7 真机证据。
- RK3568 已恢复测试前稳定构建并保持 `NTRIP_ENABLED=false`、runtime probe、聚合数 1；
  200 ms 观测合并实验已删除，不进入生产配置。
- OTA 当前只允许离线设计和可恢复备用板验证；现场 A/B/C 的 `ota_prepare/apply`
  必须返回 `unsupported`。

## Next Actions

1. 按物理标签烧录已复验的 A/B/C V7 镜像；依次做普通遥测、G3R/G3B PROBE 和保留
   参数 600 秒 LIVE，结束后定向查询三节点 V7。
2. 用节点直方图区分 RK2206 队列、UART 写入与 UM220 内部/GGA 报告时间。只有定位并
   修复可证明的延迟段，才重复 600 秒 LIVE；三节点持续 GGA=4、age P95
   `<=3 s`、max `<=5 s`、可信 GST 和全链零错误后才进入 1800 秒。
3. 1800 秒通过后再做 60 分钟生产验收和 ECEF/ENU 基线；此前 UI 只能显示 FIXED 与
   专业门禁状态，不能显示“厘米级位移已验收”。
4. 保持天线位置和连续供电，避免把每次中断后的 4--6 分钟重新收敛误判成程序回归。

## Risks

- 115200 只是 MCU-UART 标称值，不能证明 DL-XLS1 的广播、半双工、内部重试和队列吞吐。
- gateway 输入 RTCM CRC 正常不等于节点收到新鲜修正；必须使用节点端完成/注入/TTL 证据。
- `quality=4` 只证明接收机报告 RTK FIXED，不等于差分龄、GST 和位移基线都可信；本轮
  age P95/max 为 `7 s`，已明确使专业位移门禁失败，比赛界面也不得把它显示为“厘米级已验收”。
- RK2206 无可信绝对时钟时，旧模块队列风险不能只依赖节点 TTL；session epoch 必须持久化，网关必须先拒绝过期数据。
- 三节点短 PROBE 已证明 512 B 可消除本轮 assembly expiry，但只有 36 帧增量，仍不能替代 60/600 秒门禁；160 B 已现场失败，禁止直接用于 LIVE。
- 单 NTRIP 流供 3 台 rover 使用仍需确认服务商授权和同站点空间范围。
- 汇总日志证明平均输入负载，但不能证明 RTCM 单帧尺寸分布或亚秒级突发；不得用 16.91% UART 估算替代 XLS1 节点端完整率和 correction-age 证据。
- 过滤 1084 与 1124 限频有明确的接收机支持集和链路容量依据，但合成 PROBE 不能证明真实 Fixed 连续性；必须在 LIVE 前用真实 CORS 输入和节点 GGA/correction-age 证据验证，失败时回滚为关闭而非偷偷放宽门禁。
- C 控制链在线但传感器遥测为空不会减少生产容量预算；它仍使三节点传感器在线、三节点混合负载和最终厘米级系统验收保持未完成。不得以 ACK/G3S 响应替代当前传感器有效位和 compact 遥测证据。
- V5-r4 延续 V5-r3 的按需只读扫描：只在正常读取 final fail 后运行一次；扫描会尝试重叠的地址 1 寄存器组合，因此“soilQuery/tiltQuery found”仅证明该组合收到合法 Modbus 响应，不能单独证明物理型号。若 U4 自检通过且双通道 `rx_bytes=0/no_response>0`，故障才收敛到 U4 外部的隔离收发器、供电/GND、A/B、线束或传感器；有 RX 但 CRC/短帧异常则优先检查信号完整性和 UART 参数。
- 60 秒预检不能替代长测；800 ms 已在 60 秒无损、1800 秒出现 7 个缺帧。后续候选参数必须以至少 1800 秒严格门禁验收，且不得用 99.77% 的平均匹配率掩盖生产零丢帧要求。
- 当前 guardian 可以确认 4G 可达并维护主机路由，但曾观察到路由改变后部分长连接仍留在旧接口。修复完成前避免人工切换；发生真实故障切换后必须同时核对云端反向端口、Hermes、MQTT 和 field-gateway，而不能只看路由表。

## Resume Prompt

继续 2026-08-05 XLS1/RTK correction-age 分段归因：保留候选为 RTCM32_GGB、G3B=4、
burst=4、guard=600 ms、correction-window=2500 ms、observation=1 Hz。既有 600 秒三节点
最后 120 秒均 GGA=4，但 age P95/max 7 秒，专业门禁关闭。新增 RK3568 分段窗口证明
caster 到 field-write P95 约 1121 ms、串口写 P95 约 158 ms且 600 秒全链零错误，故
网关不足以解释 6--7 秒。G3S V7 已在源码实现 916 B 按需诊断和三组节点直方图，离线
回归全绿；clean 提交 `107597851b99ac8a745978adfe8a0f0aeaced668` 已推送，唯一不可变
A/B/C 包已生成并通过发布门禁但尚未烧录。下一步按标签烧录后依次做遥测、PROBE、
600 秒 LIVE，并逐节点查询 V7。RK3568 必须保持
NTRIP false、runtime probe、聚合数 1，直到受控测试开始。只有 age P95 <=3 秒、max
<=5 秒、三节点持续 GGA=4、可信 GST 和全链零错误才进入 1800 秒。Git/memory 禁止写入
凭据、端点、坐标或原始 RTCM。
