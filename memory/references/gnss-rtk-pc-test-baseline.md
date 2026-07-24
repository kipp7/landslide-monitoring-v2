---
title: gnss-rtk-pc-test-baseline
type: note
tags:
  - reference
  - gnss
  - rtk
  - ntrip
  - test
status: active
---

# Reference: gnss-rtk-pc-test-baseline

## Purpose

保存 2026-07-24 已验证的 UM220-IV NK、千寻知寸 FindCM 和 PC 串口注入测试基线，供 BT-760 到货测试及后续 RK3568/RK2206 部署复用。

## Commands

PC 测试工具位于项目工作区根目录，当前未纳入远端仓库。凭据文件保持本地且不得提交、复制到日志或写入 memory。

```powershell
python -u .\ntrip_rtk_test.py `
  --credentials '<local-credentials-file>' `
  --serial-port COM11 `
  --baud 115200 `
  --ntrip-port 8003 `
  --duration 1800
```

## Files

- `ntrip_rtk_test.py`: 读取本地凭据、向 NTRIP 发送 GGA、将原始 RTCM 全双工注入 NK，并统计 RTCM 类型和 GGA 状态；不输出账号、密码或坐标。
- 本地差分凭据文件：仅存放在项目工作区，路径和内容不进入远端仓库。

## Notes

### Hardware and serial baseline

- Rover: 3 x UM220-IV NK，固件 `R3.6.0.0`。
- PC 测试串口：`COM11`，`115200 8N1`，CH340 转接器。
- NK 可接收 RTCM 3.2/3.3；按 rover-only 规划。
- GGA 质量：`1` 单点，`2` DGPS，`5` RTK Float，`4` RTK Fixed。厘米级验收必须以稳定 `GGA=4` 为准，不能把 `5` 视为比 `4` 更高精度。

### Correction service baseline

- 服务：千寻知寸 FindCM。
- 挂载点：`AUTO`。
- 端口 `8003`：CGCS2000，历元 2000.0；系统内必须始终使用一致坐标框架。
- 已收到 `ICY 200 OK`。
- 已验证 RTCM 类型：`1005`、`1033`、`1074`、`1084`、`1094`、`1114`、`1124`。
- 差分龄约 2 s，测试期间无 NTRIP 断线。
- NTRIP 主机、账号、密码和真实坐标故意不记录在 memory。

### Antenna comparison

- 原 CT-GPS 1575.42 MHz 天线，10 分钟：GGA=2 为 518 次，GGA=5 为 82 次，GGA=4 为 0 次；首次 Float 约 259 s。
- 第二个稍好的类似天线，10 分钟：GGA=1 为 3 次，GGA=2 为 86 次，GGA=5 为 511 次（约 85.2%），GGA=4 为 0 次；首次 Float 约 3.4 s。
- 第二个天线显著改善收敛和 Float 稳定性，但尚未证明厘米级能力。
- 当前保守精度估计：水平约 0.3 至 1.5 m，垂直约 0.5 至 2 m。

### BT-760 purchase baseline

- 先购买 1 个 BT-760，卖家报价约人民币 130 元。
- 天线端为 `TNC-K`；若 NK 开发板为常见 `SMA-K`，馈线需要 `TNC-J` 到 `SMA-J`。
- 馈线要求：3 m、50 ohm、非 RP-SMA、支持直流馈电；优先低损耗铜芯线，并固定线缆避免拉扯开发板 SMA 座。
- 户外 TNC 接头使用自融防水胶带处理。
