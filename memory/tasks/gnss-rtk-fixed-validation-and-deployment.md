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

用最低成本验证现有 3 个 UM220-IV NK 能否在千寻知寸差分服务下稳定获得 RTK Fixed，并在验证通过后将单 NTRIP 客户端、三节点 RTCM 广播方案部署到 RK3568/RK2206 架构。

## Current State

- 千寻知寸 FindCM 试用已激活，PC NTRIP 接入和原始 RTCM 串口注入已验证成功。
- NK 已进入过 GGA=5 RTK Float，证明差分输入路径和 rover 解算路径有效，但两轮各 10 分钟测试均未出现 GGA=4。
- 第二个普通天线把首次 Float 缩短至约 3.4 s，并使 Float 占比达到约 85.2%。
- 已选择北天 BT-760 作为性价比验证天线；待先采购 1 个和 1 条 3 m、50 ohm、TNC-J 到 SMA-J 馈线。
- RK3568 到 3 个 RK2206 的 RTCM 广播尚未实施，等待 PC 端 BT-760 Fixed 验证。

## Constraints

- 现有链路为 RK3568 -> DL-XLS1/XL01 共享 115200 串口 -> 3 个 RK2206 -> 3 个 UM220-IV NK。
- RTCM 必须保持原始二进制，不能 JSON/Base64 包装。
- 不能在 memory、日志或 Git 中保存 NTRIP 主机、账号、密码和真实坐标。
- UM220-IV NK 按 rover 使用，不依赖其输出基站 RTCM。
- 三节点批量采购和固件改造必须等待单节点 RTK Fixed 验收结果。
- 正式遥测必须使用 `double` 和至少 8 位小数，并携带 GGA 质量、卫星数、HDOP 和差分龄。

## Plan

- 采购并核对 1 个 BT-760 与 3 m、50 ohm、TNC-J 到 SMA-J、非 RP-SMA 馈线。
- 在开阔天空、固定位置用 COM11/115200 和现有 PC 脚本运行 30 至 60 分钟测试。
- 记录首次 Fixed 时间、GGA=1/2/4/5 计数和占比、卫星数、HDOP、差分龄、RTCM 类型与断线情况。
- 若通过，采购另外 2 套同批次天线和馈线。
- 在现有 COBS + CRC 协议中定义二进制 RTCM 帧，由 RK3568 单客户端广播，RK2206 原样转发到 NK RX。
- 更新遥测结构和存储精度，随后做 3 节点同时在线、差分龄、固定率、带宽和恢复测试。
- 若不通过，依次排查开阔度/多路径、天线供电、馈线损耗、差分数据、串口完整性和固件，再评估 UM960/UM982。

## Open Questions

- BT-760 在相同测试位置能否在约 5 分钟内进入 GGA=4，并保持超过 80% Fixed？
- UM220-IV NK 在实际山体监测环境中的 Fixed 保持率和重新收敛时间是多少？
- 共享 115200 链路承载三节点遥测和 RTCM 时的帧调度、优先级与最大队列长度如何定义？
- 如果需要更换接收机，UM960 与 UM982 在单天线 rover、功耗、接口和成本上的最终选型是什么？

## Done When

- 单个 BT-760 在 30 至 60 分钟开阔环境测试中约 5 分钟内首次 Fixed，Fixed 占比高于 80%（优选高于 90%），差分龄稳定在 1 至 3 s。
- 3 个节点均使用经过验证的天线/馈线并能稳定输出 GGA=4。
- RK3568 单 NTRIP 客户端到 3 个 RK2206 的 RTCM 二进制广播完成，断线和重连可恢复。
- 遥测与存储保留足够坐标精度及完整质量字段，系统测试记录可追溯。
