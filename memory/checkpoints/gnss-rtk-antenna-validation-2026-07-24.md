---
title: gnss-rtk-antenna-validation-2026-07-24
type: note
tags:
  - checkpoint
  - gnss
  - rtk
status: active
---

# Checkpoint: gnss-rtk-antenna-validation-2026-07-24

## Objective

在现有 3 x UM220-IV NK 架构上实现稳定 RTK Fixed，并确定是否需要更换接收机。

## Last Confirmed State

- PC 上通过 COM11/115200 成功连接 UM220-IV NK，固件版本为 `R3.6.0.0`。
- 千寻知寸 FindCM NTRIP 已成功返回 `ICY 200 OK`，RTCM 1005/1033/1074/1084/1094/1114/1124 已注入 NK，差分龄约 2 s 且没有断线。
- 原 CT-GPS 天线 10 分钟仅得到 82 次 Float、0 次 Fixed；第二个普通天线 10 分钟得到 511 次 Float、0 次 Fixed，首次 Float 由约 259 s 改善到约 3.4 s。
- 当前只能按 RTK Float 估计精度，水平约 0.3 至 1.5 m、垂直约 0.5 至 2 m，不能按厘米级验收。
- 已确认 GGA=4 才是 RTK Fixed，GGA=5 是 RTK Float。
- 已确认 BT-760 正式规格与接口方向符合当前验证需求；决定先买 1 个而不是直接买 3 个。
- 已确认馈线组合为 TNC-J 到 SMA-J，3 m、50 ohm、非 RP-SMA；天线端 BT-760 为 TNC-K。

## In Progress

- 等待采购并收到 1 个 BT-760 和配套 3 m 馈线。
- RK3568 单 NTRIP 客户端向 3 个 RK2206 广播 RTCM 的固件工作尚未开始。

## Next Actions

- 到货后核对接口、公母头、50 ohm、线缆类型及有源天线馈电。
- 在开阔固定位置运行 30 至 60 分钟 PC 对比测试，保存 GGA 状态计数、首次 Fixed、Fixed 占比、差分龄、卫星数和 HDOP。
- 达标后购买另外 2 套同批次天线/馈线并进入 RK3568/RK2206 RTCM 广播实现。
- 不达标时先完成天线供电、馈线、天空视野、多路径、差分和固件排查，再决定是否升级 UM960/UM982。

## Risks

- BT-760 官方标称相位中心误差 +/- 2 mm，但没有频点/方位完整校准数据，不能仅凭规格表保证现场厘米级。
- 山体环境的树木、坡体、箱体和金属安装件可能造成遮挡或多路径，使更好的天线仍难以保持 Fixed。
- 共享 115200 链路若缺少 RTCM 帧优先级和队列上限，可能增加差分龄或影响现有遥测。
- NTRIP 凭据和真实坐标必须保持在本地未跟踪文件中。

## Resume Prompt

继续 GNSS RTK 验证：先读取 `memory/decisions/gnss-rtk-correction-and-antenna-strategy.md`、`memory/references/gnss-rtk-pc-test-baseline.md` 和 `memory/tasks/gnss-rtk-fixed-validation-and-deployment.md`，确认 BT-760 是否到货；若已到货，在开阔位置用现有 PC 脚本执行 30 至 60 分钟测试并按 GGA=4 Fixed 指标验收。
