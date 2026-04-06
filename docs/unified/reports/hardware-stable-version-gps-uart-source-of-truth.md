---
title: hardware-stable-version-gps-uart-source-of-truth
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/hardware-stable-version-gps-uart-source-of-truth
---

# 硬件稳定版 GPS / UART 单一当前真值

## 状态

- 主题：`hardware-stable-version-gps-uart-source-of-truth`
- 结论日期：`2026-03-25`
- 适用范围：
  - `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0`

## 1. 当前发现的冲突

本次比对后，GPS / UART 真值至少存在 3 套：

### 方案 A

- `GPS_UART_ID = EUART1_M1`
- 引脚：`PA6 / PA7`

出现在：

- `当前配置总结.md`
- `PINOUT.md`
- `GPS引脚冲突解决方案.md`
- `README_zh.md`

### 方案 B

- `GPS_UART_ID = EUART0_M1`
- 引脚：`PC6 / PC7`

出现在：

- `GPS最终方案.md`
- `小凌派GPS引脚方案修正.md`
- `VERSION.txt`

### 方案 C

- `GPS_UART_ID = EUART0_M0`
- 引脚：`PB6 / PB7`

出现在当前实际编译代码：

- `config/app_config.h`
- `drivers/sensors/gps_driver.c`
- `drivers/sensors/gps_module.h/.c`

## 2. 当前应采用哪一份真值

### 当前推荐单一真值

在没有新的板级实测证据前，当前应先以**实际编译入口中的代码真值**作为唯一当前真值：

- GPS：`EUART0_M0`
- 引脚：`PB6 / PB7`
- XL01：`EUART2_M1`
- 引脚：`PB2 / PB3`
- I2C：`EI2C0_M0`
- 引脚：`PB4 / PB5`

## 3. 为什么当前先选代码真值

理由不是“它一定最终正确”，而是：

1. 当前真实参与编译的是：
   - `config/app_config.h`
   - `drivers/sensors/gps_driver.c`
   - `drivers/sensors/mpu6050_driver.c`
   - `drivers/sensors/sht30_driver.c`

2. 当前代码里已经把 I2C 迁到了：
   - `PB4 / PB5`

3. 这意味着代码层已经主动释放了：
   - `PB6 / PB7`
   给 GPS 使用

4. 而 `EUART1_M1` 和 `EUART0_M1` 两套文档真值目前都没有对应地落实到当前编译代码里

因此：

- **当前代码真值 = 当前工程真值**
- 其他文档真值 = 历史候选 / 待归档真值

## 4. 当前统一后的接口分配

### XL01

- UART：`EUART2_M1`
- 引脚：`PB2 / PB3`
- 状态：已测试

### GPS

- UART：`EUART0_M0`
- 引脚：`PB6 / PB7`
- 状态：代码真值，仍需真实硬件复验

### I2C 传感器

- I2C：`EI2C0_M0`
- 引脚：`PB4 / PB5`
- 覆盖：
  - MPU6050
  - SHT30

## 5. 必须同步收口的文件

### 立即改成与当前代码真值一致

- `当前配置总结.md`
- `PINOUT.md`
- `README_zh.md`
- `接线检查清单.md`

### 必须标旧或归档

- `GPS引脚冲突解决方案.md`
- `GPS最终方案.md`
- `小凌派GPS引脚方案修正.md`
- `VERSION.txt` 中相互冲突的 GPS 口描述

## 6. 风险提示

当前把 `EUART0_M0 / PB6 / PB7` 作为单一真值，只是为了**先统一当前工程**，不代表它已经完成板级验证。

仍需真机确认：

1. 板上 `PB6 / PB7` 是否确实可用于 GPS UART
2. 当前 `EI2C0_M0 / PB4 / PB5` 是否在板级接线中也同步成立
3. GPS 模块实际 wiring 是否与当前代码一致

## 7. 当前结论

当前大路线应先执行：

1. 以代码真值冻结 GPS / UART 当前态
2. 清理文档冲突
3. 再往下做 `TelemetryEnvelope v1` 和 `cmd_ack/{device_id}` 的固件适配

也就是说，当前优先级不是继续讨论 3 套 GPS 候选，而是先让当前工程只剩 1 套当前真值。