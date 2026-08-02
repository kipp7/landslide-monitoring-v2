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

### In-Progress V4 Runtime Integration (2026-08-03)

- 用户已将 A/B/C 全部下电；本轮只做 RK3568、服务器、Windows 桌面端和离线固件发布包，禁止把离线软件测试误记为三节点真实链路或厘米级验收。明天烧录后仍需依次完成 V4 纯遥测、RTCM 会话确认、真实 CORS LIVE 和室外 `GGA=4` 门禁。
- RK2206 已形成 compact V4：139 字节 payload、157 字节完整 COBS/CRC 帧，前 95 字节与 V3 字段兼容，新增 44 字节为 RTCM 启动模式、运行时会话/租约、队列、最近动作年龄和累计错误证据。固件具备 LIVE capability，但开机强制 `DISABLED`；只有 RK3568 发送带目标掩码、非零会话号和有限租约的 19 字节控制命令后才允许 RTCM，重启或租约超时自动禁用。
- RK3568 已接入 NTRIP、GGA、RTCM3 解码/筛选、单份广播分片和三节点同会话确认。NTRIP 客户端新增兼容只有 `ICY 200 OK\r\n` 后直接输出 RTCM 的 v1 caster；密码不进入统计、健康文件或日志。串口写失败的 RTCM 分片会放回有界队列头部，利用节点端幂等分片处理重试，避免瞬时写失败必然造成整帧缺片；当前网关 44/44 测试通过。
- 服务器 `telemetry-writer` 已在生产部署：compact V4 与 V3 一样执行完整快照替换，清除旧空气温湿度、MPU6050 和过期 RTK 字段；V4 RTCM 指标与元数据已加入白名单，不再被丢弃。现网 offset 显式提交和有效 GPS 保留两项热修复均已保留；当前 14/14 测试通过，生产运行时 hook 也已证明 V4 替换语义。
- RK2206 主机协议金值通过：`compact_v4_payload_bytes=139`、`field_link_wire_bytes=157`；V3/V4 发布验证器正向与篡改/身份/模式/运行时启动状态拒绝路径通过。引脚门禁解析 `BUILD.gn` 中实际编译的 25 个 C 源文件，要求 `XLS1=EUART2_M1 PB2/PB3 MUX_FUNC3`、`GPS=EUART0_M0 PB6/PB7 MUX_FUNC2`、`BATTERY=PC0 ADC0 input-only`、`RS485=EI2C0_M0 PB4/PB5 MUX_FUNC4`，并拒绝编译旧 GPS/sensors、MPU6050 或 SHT30；错误 UART 引脚、错误 I2C mux 和误编译 MPU6050 三项负例均已证明会失败。
- Windows 桌面端字段契约已完成本地复核、lint、生产构建和原生包运行门禁：设备页、详情和 CSV 统一使用土壤温度/湿度/EC、三轴倾角、可信 RTK 与专业位移；不再读取空气温湿度、MPU6050 或旧 6 位小数坐标。坐标仅在 `rtk_trusted=true` 时以 9 位小数显示，缺失值显示“不可用”而不是伪造 0。42 字段 compact V4 writer 契约回归完整通过。RK3568、服务器、Windows 包和正式 A/B/C V4 包现已完成；剩余工作是真实三节点与室外 Fixed 验收，以及在可信 Fixed 样本成立后完成 ECEF/ENU、Hampel/Kalman 和服务器 CEEMDAN 的长周期算法门禁。生产轮询仍保持已通过 1800 秒门禁的 1000 ms + 部分响应一次有界重发；139 B 不是当前瓶颈，未经 1800 秒实机长测不得下调生产冷却。
- 最终源码提交为 `47cbddce3aab1d478087e45f95ff477f4a235d44`，已确认推送到 `origin/feat/gnss-rtk-v31-transport`。正式 A/B/C V4 hardware 包位于 `F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_hardware_live_20260803_r2`，manifest SHA-256 为 `1ee3a5f8402cb64c9bcf5997cfbe53e4b7c4bf430765b98e90a498189c672e7d`；A/B/C `.img` SHA-256 分别为 `7b5e775e72e4f3f5a29c8c0810d53aaf0a3bbba99ca8c07de7fa4eb4c2f7b70a`、`a1ed7806ee3d2237097c61586783d5b757234099427f83660f6a8f2dd48bfa00`、`eb6a744306c09832ee4c6012232eb7bcc7d82b78664ef3fa39f95d7538054773`，loader SHA-256 为 `761d90888aa376156d562abf267dfe324b96c4397f7a601f6b4c64d0ea3bf977`。发布验证为 `sourceDirty=false`、7 个预期固件文件、唯一 A/B/C 身份、V4 139/157 B、hardware、最终校准、LIVE capability、boot DISABLED、runtime finite lease control 全部通过；非 `r2` 目录已被取代。
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

- 明天先核对 C 的独立供电来源，再按物理标签烧录 `xls1_compact_v4_hardware_live_20260803_r2` 中 A/B/C 对应 `.img`；不得混刷身份，也不得使用非 `r2`、早期 rejected/dirty 候选。
- 保持 `NTRIP_ENABLED=false`，先运行 `sudo python3 /usr/local/bin/xls1_compact_v4_acceptance.py --check-prerequisites`，再运行不带参数的同一脚本。它会确认三节点均为 compact V4、RTCM `disabled`/READY-only、session/lease/队列/全部历史 RTCM 计数为 0、RS485 三合一土壤/EC和独立三轴倾角有效、PC0 为 field-calibrated，并按 1000 ms cooldown、1200 ms 首窗、部分响应最多重发一次、2500 ms 总时限自动执行 60/600/1800 秒；任一阶段失败立即停止。
- A/B/C 已分别以 `+9/+7/最坏 9 mV` 通过电池同步验收并接受 `1046565/1048458/993702 ppm`，最终校准文件及 simulated/hardware 发布包均已生成并通过 final-acceptance、身份、哈希、模式和引脚门禁；百分比仍只是受负载、温度和老化影响的 3S OCV 估算，不能作为准确剩余 mAh 或续航。
- 保持 4G 主用、1000 ms 冷却和已部署的单次有界重发；持续观察生产重发率不高于 2%、总逻辑响应不高于 2500 ms，网线只保留局域网路由，不再通过人工插拔切换公网链路。
- 纯遥测 1800 秒通过后，才把 CORS 参数写入 RK3568 本地 `600 root:root` 环境文件；密码不进入 Git、memory、日志或健康 JSON。先设置 `RTCM_RUNTIME_MODE=probe`，验证三节点确认同一非零 session/有限 lease、160 B 分片、160 ms 调度、RTCM 类型筛选、队列/CRC/UART 错误为 0，再进入 LIVE。
- 捕获至少 60 s 不含凭据的实际 RTCM 与脱敏容量汇总；原始差分流和真实坐标不进入 Git。已部署 shaper 只保留 1005/1033/1074/1094/1124，过滤 UM220 不支持的 1114/1084，并以最新帧优先和 TTL 控制 correction age。
- 在恢复 QZSS 前设计并门禁低频累计确认/选择性重传或等价的有界可靠机制；不能用无限队列、逐帧三节点 ACK 或盲目全量重复换取表面零丢包。机制必须保持 correction age 有界，并实测三节点反向确认不会与 compact 遥测争用半双工链路。
- PROBE 通过后执行真实 NTRIP 混合负载；不把合成/PROBE 通过等同于 RTK Fixed。每次只改变一个层级：hardware 纯遥测 -> PROBE -> LIVE -> 室外 Fixed；不同时回退 RK2206 和 RK3568。
- 至少运行 60 分钟三节点门禁，目标 correction age P95 <=3 s、max <=5 s、无旧 session 注入且 Fixed 连续。
- 室外 `GGA=4` 与可信门禁通过后，才用这些样本建立基线并完成 RK3568 ECEF/ENU、Hampel/Kalman、服务器 CEEMDAN 和 UI/profile 的算法验收；当前 API 的可信 RTK 筛选与高精度显示不能替代该算法门禁。
- OTA 只在可有线救援备用板推进：先证明 loader 可手动启动 FW1/FW2，再实现 fail-closed Flash HAL、签名、冗余原子元数据、pending/confirm/rollback 和掉电注入测试。所有门禁通过前，现场 A/B/C 的 `ota_prepare/apply` 必须返回 `unsupported`。

## Open Questions

- A/B 已通过的 450 B/s 共同候选在 C 和真实 RTCM、三节点上行混合负载下，空口广播行为、Fixed 连续性和旧队列风险是否仍满足门禁？
- RK2206 无可信绝对 Unix 时钟时，是否接受网关绝对 TTL + 节点单调队列龄的双层策略，或需要补充可信时间同步？
- 单条修正流供同一现场 3 台 rover 使用是否满足服务商授权与空间范围？

## Done When

- 3 节点 60 分钟真实混合负载满足 correction age、Fixed 连续性、CRC、队列、旧 session 和命令延迟门槛。
- 定点 `GNSS_CORE`、RK3568 专业位移算法、可追溯存储和生产/比赛配置均通过测试。
- RK2206 新增 GNSS RAM/CPU、RK3568 增量 RSS/CPU 和链路占用有实测报告且满足预算。
