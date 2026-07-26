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
- 主机测试、field-gateway 9 项回归/lint 及 `DISABLED/PROBE/LIVE` 三模式固件交叉编译均通过；A/B/C 已刷入已校验的 `PROBE` 正式包并在 RK3568 健康文件中恢复在线。
- RK3568 已向 A 发送 12 s 的 `32B/15ms` 基线（76 帧/100 分片）且网关自动恢复；由于电脑尚未连接 A 调试 UART，节点端重组/CRC/队列计数仍待核验，单节点 `PROBE` 尚未通过。三节点 60 分钟混合负载和 `LIVE` 门禁也未完成。
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
- 在确认物理连接、回滚镜像和日志采集后，只给单节点刷 `PROBE`；验证重组/CRC/队列/过期/重复计数且 UM220 UART 无写入。
- 按 32B/15ms、64B/5ms、128B/0ms 顺序扫参，加入 3 个 1 Hz `GNSS_CORE`、compact 环境遥测和控制命令。
- 至少运行 60 分钟三节点门禁，目标 correction age P95 <=3 s、max <=5 s、无旧 session 注入且 Fixed 连续。
- 通过后才启用 `LIVE`，随后实现定点 GNSS 解析、RK3568 ECEF/ENU/Hampel/Kalman、服务器 CEEMDAN 和 UI/profile。

## Open Questions

- DL-XLS1 在真实 RTCM 和三节点上行混合负载下的空口容量、广播行为和旧队列风险是否满足门禁？
- RK2206 无可信绝对 Unix 时钟时，是否接受网关绝对 TTL + 节点单调队列龄的双层策略，或需要补充可信时间同步？
- 单条修正流供同一现场 3 台 rover 使用是否满足服务商授权与空间范围？

## Done When

- 3 节点 60 分钟真实混合负载满足 correction age、Fixed 连续性、CRC、队列、旧 session 和命令延迟门槛。
- 定点 `GNSS_CORE`、RK3568 专业位移算法、可追溯存储和生产/比赛配置均通过测试。
- RK2206 新增 GNSS RAM/CPU、RK3568 增量 RSS/CPU 和链路占用有实测报告且满足预算。
