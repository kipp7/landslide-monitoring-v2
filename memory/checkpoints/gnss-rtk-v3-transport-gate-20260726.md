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
- field-gateway 9 项测试和 lint 通过；RK2206/OpenHarmony 的 `DISABLED`、`PROBE`、`LIVE` 三种 A 节点固件均交叉编译通过。只生成了仓库外验证产物，没有刷写设备。
- 约 882 B/s 的显式模型只用于离线筛选：`32B/15ms` 不适合作为 RTCM 发送参数，`64B/5ms` 和 `128B/0ms` 仍只是待真机验证候选，不能视为空口结论。
- PC 脚本可只保存 CRC24Q 正确的原始 RTCM 帧，且不写凭据、GGA、NTRIP header 或真实坐标；尚未取得 60 s 实际捕获用于容量计算。
- 本 checkpoint 和提交均不包含 CORS 主机、账号、密码、真实坐标或现场原始日志。

## In Progress

- 软件边界已完成并默认关闭；当前等待真实 RTCM 捕获和 XLS1 真机混合负载门禁。
- RK2206 当前没有独立可信的 Unix 时钟。节点可执行 1500 ms 重组超时和最多 3000 ms 本地队列龄，但绝对生成时间 TTL 只能计为 `ttl_unverified`，由 RK3568 先做绝对新鲜度过滤。
- 现有 GPS 驱动已阻止 RMC 状态错误设置 Fixed，并公开原始 GGA quality；完整 GGA/GSA/GST/GSV/RMC/ZDA 定点解析和 `GNSS_CORE` 1 Hz 上送尚未实现。

## Next Actions

- 用增强后的 PC 脚本捕获至少 60 s 无凭据原始 RTCM，并运行 `scripts/field/xls1_gnss_v31_capacity_sweep.py` 生成 capture-driven 报告。
- 先制作并确认 `PROBE` 真机测试步骤，只验证无线接收、重组、CRC、队列和计数；确认物理连接与回滚镜像后才能刷写单节点 A。
- 硬件扫参按 `32B/15ms -> 64B/5ms -> 128B/0ms` 顺序，后一个候选只在前一个没有帧损坏、旧队列或控制延迟时进入。
- 真实门禁负载包含 RTCM、3 个 1 Hz `GNSS_CORE`、compact 环境遥测和控制命令；记录每节点 correction age P50/P95/max、Fixed 连续性、CRC、重组、队列、注入、旧 session 和命令延迟。
- 至少运行 60 分钟；初始通过条件为 correction age P95 <= 3 s、max <= 5 s、没有旧 session 注入且 Fixed 连续。未通过前保持 `LIVE` 关闭。
- 传输通过后再完成 RK2206 定点 GNSS 解析与上送、RK3568 ECEF/ENU/Hampel/Kalman、服务器 CEEMDAN 和 UI/profile 集成。

## Risks

- 115200 只是 MCU-UART 标称值，不能证明 DL-XLS1 的广播、半双工、内部重试和队列吞吐。
- gateway 输入 RTCM CRC 正常不等于节点收到新鲜修正；必须使用节点端完成/注入/TTL 证据。
- RK2206 无可信绝对时钟时，旧模块队列风险不能只依赖节点 TTL；session epoch 必须持久化，网关必须先拒绝过期数据。
- `PROBE/LIVE` 目前只完成可构建证明，没有真机运行证据；不得由编译成功推导厘米级三节点已部署。
- 单 NTRIP 流供 3 台 rover 使用仍需确认服务商授权和同站点空间范围。

## Resume Prompt

继续 V3.1 传输门禁：先检查分支 `feat/gnss-rtk-v31-transport`、提交 `4ed2ce5b`/`e00107ed` 和凭据扫描；获取 60 s 原始 RTCM capture 做容量报告，然后准备单节点 `PROBE` 真机步骤。不要先启用 `LIVE`，不要先实现滤波、CEEMDAN 或 UI。
