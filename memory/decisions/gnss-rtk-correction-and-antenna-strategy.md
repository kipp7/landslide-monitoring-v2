---
title: gnss-rtk-correction-and-antenna-strategy
type: note
tags:
  - decision
  - gnss
  - rtk
  - rk3568
  - rk2206
status: active
---

# Decision: gnss-rtk-correction-and-antenna-strategy

## Context

系统有 3 个 RK2206 现场节点，每个节点连接 1 个 UM220-IV NK，节点通过 DL-XLS1/XL01 与 RK3568 网关通信。目标是在不立即更换全部接收机的前提下提高定位精度，并验证现有 NK 是否能够稳定进入 RTK Fixed。

PC 端已证明 CORS、原始 RTCM 注入、UM220-IV NK 和 BT-760 能进入并连续保持 RTK Fixed，3 套 BT-760 已到货。因此当前优先瓶颈转为 RK3568-DL-XLS1-RK2206 共享传输、精密数据契约和专业位移算法，不再默认更换接收机。

## Decision

- RK3568 作为唯一 NTRIP 客户端，获取原始二进制 RTCM 后广播给 3 个 RK2206 节点。
- RK2206 将 RTCM 原样转发到各自 UM220-IV NK 的 RX；不得使用 JSON 或 Base64 包装 RTCM。
- 在现有 COBS + CRC 链路协议中增加独立的二进制 RTCM 帧类型。
- 3 套 BT-760 分别用于 3 个 UM220-IV NK；RK3568 不增加 GNSS 接收机或天线。
- 不为缺少可量化差异的 BT-760E 支付溢价。卖家表中 BT-760 与 BT-760E 的公开参数相同，北天官网当前可查到 BT-760 正式产品页，但未查到能证明 E 版本更优的正式规格。
- 只有在天线、馈线、开阔度、差分龄和固件均验证正常而 BT-760 仍无法稳定 Fixed 后，才评估将 rover 升级为 UM960 或 UM982。
- RK2206/南向协议使用纳度、毫米和定标整数；RK3568/API 使用 `double` 并至少序列化 9 位小数。`GNSS_CORE` 只传专业位移所需的结构化核心证据，原始 NMEA、逐星 GSV 和调试输出只允许限时按需抓取。
- RK3568 统一执行坐标框架校验、ECEF/ENU、Hampel、每节点自适应 Kalman、位移/速度、创新监测和告警；RK2206 不运行第二套独立位移滤波。
- V3.1 协议提交为 `4ed2ce5b`，默认关闭的 RK2206 RTCM 注入边界提交为 `e00107ed`；真机混合负载门禁通过前不得刷入 `LIVE`。

## Rationale

- 单个 BT-760 的试错成本约为人民币 130 元，明显低于一次性更换 3 个接收机。
- BT-760 官方标称四星全频、38 +/- 2 dB 增益、轴比不大于 3 dB、相位中心误差 +/- 2 mm、TNC-K 接口，并采用多馈点对称结构和抗多路径扼流设计，方向上符合 RTK 天线需求。
- 已有测试显示更好的天线能把首次 Float 从约 259 s 缩短到约 3.4 s，并将 Float 占比提高到约 85%，说明天线质量对当前系统有显著影响。
- 单一 NTRIP 客户端降低账号连接数、移动网络流量和运维复杂度，并与现有 RK3568 到 RK2206 的星型链路一致。

## Consequences

- 天线采购和单机 Fixed 能力验证已完成，但三节点 RTCM 广播与专业位移链仍未通过现场验收。
- BT-760 是合理的首选验证天线，但官方标称不等于现场厘米级保证；RTK Fixed 仍取决于天空视野、多路径、差分质量、馈线和接收机算法。
- 升级接收机不能修复严重遮挡、多路径、错误馈线或过期差分数据，因此模块升级不是默认兜底。
- UM220-IV NK 按 rover 使用；当前测试未得到有效基站 RTCM 输出，不把它规划为 Base。

## Follow-up

- 按 `memory/checkpoints/gnss-rtk-v3-transport-gate-20260726.md` 先完成原始 RTCM capture、单节点 `PROBE` 和 60 分钟三节点混合负载门禁。
- 传输通过后再实施定点 GNSS 解析、RK3568 专业位移算法、服务器 CEEMDAN 和界面；共享链路失败不作为更换 UM220-IV NK 的直接依据。
