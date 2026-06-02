---
title: Field Node Carrier V0 Layout Plan
type: report
permalink: landslide-monitoring-v2-mainline/docs/hardware/field-node-carrier-v0-layout-plan
---

# 分节点接口载板 V0 打板方案

## 0. 2026-05-07 新 PCB 固件接入结论

当前新 PCB 已采用模块载板方案，不再把 RS485 作为“后续预留”处理：

```text
RK2206 PB4/PB5 I2C
  -> SC16IS752 双串口扩展
  -> 两路隔离自动收发 TTL-RS485 模块
  -> J6/J7 现场传感器端子
```

这意味着 RK2206 固件必须通过 `SC16IS752` 读写 RS485，不能再使用“RK2206 硬件 UART 直连 RS485”的旧预留驱动。`PC2/PC3` 保持为调试日志/shell。

当前 bring-up 只测试倾角传感器：

```text
J6 / SC16IS752 UART A / channel 0
addr = 1
baud = 4800 8N1
read = 0x0000..0x0002
scale = signed int16 * 0.01 deg
```

倾角传感器接线：

```text
棕线 V+   -> J6 Pin1 VBAT_SW
黑线 GND  -> J6 Pin2 GND
黄线 485-A -> J6 Pin3 RS4851_A
蓝线 485-B -> J6 Pin4 RS4851_B
```

后续如本文件旧章节仍出现 `UART_RS485 -> RS485 收发器`、单路 SP3485 或 USB-RS485 临时调试描述，以本节的新 PCB 结论为准。

## 1. 方案定位

本文件用于指导 `LSM-FieldNode-Carrier-V0` 分节点接口载板打板。

当前阶段目标不是把所有器件高度集成到一块主板上，而是先做一块可靠的接口载板，把当前临时硬件与正式传感器接线规范化。

当前过渡配置：

- GNSS：`UM220-IV NK`
- 无线链路：`XL01`
- 主控：当前 `RK2206 / 小凌派` 节点板
- 传感器：
  - RS485 土壤水分/温度/电导率三合一
  - RS485 双轴倾角传感器
- 雨量计：放在 RK3568 网关侧，不挂在分节点上

后续正式替换：

- GNSS 可从 `UM220-IV NK` 替换为 `UM980 rover`
- RS485 传感器接口保持不变
- 整体链路和载板接口不推翻

## 2. 总体架构

```text
12V_IN
  |
  +-- 12V_SENSOR  -> RS485 土壤传感器 / RS485 倾角传感器
  +-- 5V_SYS      -> UM220-IV NK / 后续 UM980 开发板
  +-- 3V3_SYS     -> RK2206 / XL01 / RS485 逻辑

RK2206
  |
  +-- UART_GNSS  -> UM220-IV NK / UM980
  +-- UART_RADIO -> XL01
  +-- UART_RS485 -> RS485 收发器 -> A/B 总线 -> 土壤 + 倾角
```

## 3. 功能分区

PCB 建议按以下区域布局：

| 分区 | 内容 | 布局要求 |
|---|---|---|
| POWER 区 | 12V 输入、保险丝、TVS、反接保护、DC-DC | 靠近电源输入端子 |
| MCU/E53 区 | RK2206 / 小凌派插接区域 | 居中或便于固定 |
| GNSS 区 | UM220-IV NK / UM980 接口 | 靠板边，远离开关电源和 XL01 天线 |
| RADIO 区 | XL01 接口 | 靠板边，预留天线净空 |
| RS485 区 | RS485 收发器、防护、传感器端子 | 靠外部线缆出口 |
| DEBUG 区 | 调试串口、跳帽、测试点 | 靠板边，便于调试 |

## 4. 核心接口清单

| 接口编号 | 推荐封装 | 引脚定义 | 用途 |
|---|---|---|---|
| `J_PWR_IN` | 5.08mm 2Pin 插拔端子 | `12V_IN / GND` | 分节点主电源输入 |
| `J_RS485_1` | 5.08mm 5Pin 插拔端子 | `12V_SENSOR / GND / A / B / SHIELD` | 倾角传感器 |
| `J_RS485_2` | 5.08mm 5Pin 插拔端子 | `12V_SENSOR / GND / A / B / SHIELD` | 土壤传感器 |
| `J_GNSS` | JST-GH 6Pin 或 2.54mm 6Pin | `5V / GND / GNSS_TX / GNSS_RX / PPS / RESET` | UM220-IV NK 或 UM980 rover |
| `J_XL01` | JST-GH 4Pin 或 2.54mm 4Pin | `3V3 / GND / XL01_TX / XL01_RX` | XL01 无线模块 |
| `J_DEBUG` | 2.54mm 4Pin | `3V3 / GND / MCU_TX / MCU_RX` | 调试串口 |
| `J_E53` | E53 20Pin 母座或等效排针 | 按 RK2206/E53 引脚定义 | 连接当前主控板 |
| `J_EXT` | 2.54mm 8Pin 预留 | `3V3 / 5V / GND / I2C / SPI / UART` | 扩展接口 |

## 5. 推荐 Pin 定义

### 5.1 主电源接口 `J_PWR_IN`

```text
Pin1  12V_IN
Pin2  GND
```

建议：

- 第一版使用 `KF2EDG-5.08-2P` 或 `KF301-5.08-2P`
- 正式户外版可升级为 M12 防水电源接头，箱内仍接端子排

### 5.2 RS485 传感器接口 `J_RS485_1 / J_RS485_2`

```text
Pin1  12V_SENSOR
Pin2  GND
Pin3  RS485_A
Pin4  RS485_B
Pin5  SHIELD
```

说明：

- `J_RS485_1` 和 `J_RS485_2` 在电气上并联到同一条 RS485 总线
- 两个端子只是为了现场接线方便
- 不是两路独立 RS485
- 推荐 `J_RS485_1` 接倾角，`J_RS485_2` 接土壤

### 5.3 GNSS 接口 `J_GNSS`

```text
Pin1  5V_GNSS
Pin2  GND
Pin3  GNSS_TX_TO_MCU
Pin4  GNSS_RX_FROM_MCU
Pin5  GNSS_PPS
Pin6  GNSS_RESET
```

说明：

- 当前接 `UM220-IV NK`
- 后续可接 `UM980 rover`
- 该接口负责 NMEA 上行和 RTCM 下行
- 若具体模块为 3.3V 供电，需按模块板要求调整，不直接假设裸模块供电

### 5.4 XL01 接口 `J_XL01`

```text
Pin1  3V3
Pin2  GND
Pin3  XL01_TX_TO_MCU
Pin4  XL01_RX_FROM_MCU
```

说明：

- 负责节点 telemetry 上行
- 负责命令/RTCM 下行
- XL01 天线区域附近不要铺大面积铜皮，不要紧贴金属外壳

### 5.5 调试接口 `J_DEBUG`

```text
Pin1  3V3
Pin2  GND
Pin3  MCU_TX_DEBUG
Pin4  MCU_RX_DEBUG
```

## 6. 串口资源规划

理想情况下，分节点需要三路串口：

| 串口 | 连接对象 | 作用 |
|---|---|---|
| `UART_GNSS` | UM220-IV NK / UM980 | 接收 NMEA，发送 RTCM |
| `UART_RADIO` | XL01 | 上行 telemetry，下行命令/RTCM |
| `UART_RS485` | RS485 收发器 | Modbus RTU 轮询土壤和倾角 |

如果 RK2206 可用串口不足，V0 载板必须预留补救：

- 预留 `SC16IS752` 双 UART 扩展芯片位置，I2C/SPI 接 RK2206
- 或预留 `J_EXT_UART`，后续通过小模块补串口
- 不建议把 GNSS、XL01、RS485 硬挤到同一串口

## 7. RS485 总线设计

### 7.1 最小电路

```text
MCU_TX_RS485 -> RS485_DI
MCU_RX_RS485 <- RS485_RO
GPIO_RS485_DIR -> RS485_DE + RS485_/RE
RS485_A/B -> 外部传感器总线
```

V0 可选收发器：

- `SP3485`
- `MAX3485`

正式户外版可选隔离收发器：

- `ADM2483`
- `ISO3082`
- `CA-IS3082W`

### 7.2 防护与配置

RS485 A/B 附近建议放：

- `SM712` TVS
- `120Ω` 终端电阻，使用跳帽 `JP_TERM` 控制
- 上拉/下拉偏置电阻，使用跳帽 `JP_BIAS` 控制
- 共模电感预留位
- `TP_A / TP_B / TP_GND / TP_SHIELD` 测试点

### 7.3 总线拓扑

推荐现场接线：

```text
分节点载板 -> 倾角传感器 -> 土壤传感器 -> 末端终端电阻
```

如果两个传感器都离节点很近，可以分别从 `J_RS485_1` 和 `J_RS485_2` 出线，但分叉线尽量短。

软件通过 Modbus 地址区分设备：

```text
倾角传感器：addr = 1
土壤传感器：addr = 2
```

## 8. 电源设计

### 8.1 电源树

```text
12V_IN
├─ FUSE / 反接保护 / TVS
├─ 12V_SENSOR：RS485 土壤、倾角
├─ 5V_SYS：UM220-IV NK / 后续 UM980 开发板
└─ 3V3_SYS：RK2206 / XL01 / RS485 逻辑
```

### 8.2 电源能力建议

| 电源轨 | 建议能力 | 用途 |
|---|---:|---|
| `12V_SENSOR` | `12V / 1A` | RS485 土壤、倾角等外部传感器 |
| `5V_SYS` | `5V / 1A` | GNSS 开发板/模块板 |
| `3V3_SYS` | `3.3V / 800mA` | RK2206、XL01、逻辑电平 |

### 8.3 供电注意事项

- RS485 传感器统一使用 `12V_SENSOR`
- 不要用 MCU 的 3.3V 或 5V 直接给工业传感器供电
- 每个传感器电源分支建议串保险丝或自恢复保险丝
- 12V 输入加 TVS 和反接保护
- 板上预留测试点：
  - `TP_12V_IN`
  - `TP_12V_SENSOR`
  - `TP_5V`
  - `TP_3V3`
  - `TP_GND`

## 9. PCB 布局要求

### 9.1 端子布局

- 所有外部端子靠板边
- `J_PWR_IN` 靠 POWER 区
- `J_RS485_1 / J_RS485_2` 靠 RS485 防护区
- `J_GNSS` 靠板边，方便接 GNSS 模块和天线线缆
- `J_XL01` 靠板边，方便无线模块天线布置

### 9.2 走线要求

- RS485 A/B 走线靠近、平行、尽量等长
- RS485 远离 DC-DC 电感和开关节点
- 12V 输入线宽按电流留足
- GNSS 和 XL01 区域远离开关电源
- 天线附近避免大面积铜皮和金属遮挡

### 9.3 机械要求

- 至少 4 个 M3 安装孔
- 端子旁边预留扎带孔
- 外部接口丝印必须清晰：
  - `12V`
  - `GND`
  - `A`
  - `B`
  - `SHIELD`
- 板边预留外壳安装和进线空间

## 10. V0 不做的内容

V0 载板不建议集成以下内容：

- 不裸焊 UM980/UM220 射频模块
- 不自己画 GNSS 射频走线
- 不把雨量计接入分节点，雨量计放网关侧
- 不保留 `MPU6050` 作为正式倾角传感器
- 不使用杜邦线作为户外正式接口
- 不把土壤、倾角传感器芯片级集成到板上

## 11. 推荐 BOM

### 11.1 分节点载板核心器件

| 类别 | 推荐器件/规格 | 数量 |
|---|---|---:|
| 主电源端子 | 5.08mm 2Pin 插拔端子 | 1 |
| RS485 传感器端子 | 5.08mm 5Pin 插拔端子 | 2 |
| GNSS 接口 | JST-GH 6Pin 或 2.54mm 6Pin | 1 |
| XL01 接口 | JST-GH 4Pin 或 2.54mm 4Pin | 1 |
| Debug 接口 | 2.54mm 4Pin | 1 |
| RS485 收发器 | SP3485 / MAX3485 | 1 |
| RS485 TVS | SM712 | 1 |
| 终端电阻 | 120Ω + 跳帽 | 1 |
| DC-DC | 12V -> 5V | 1 |
| LDO/DC-DC | 5V -> 3.3V | 1 |
| 输入保护 | 保险丝、TVS、反接保护 | 1 套 |
| 测试点 | 12V/5V/3V3/GND/A/B | 1 批 |

### 11.2 外接设备

| 设备 | 当前型号/规格 |
|---|---|
| GNSS | UM220-IV NK，后续替换 UM980 |
| 无线 | XL01 |
| 土壤传感器 | RS-ECTH-N01-TR-1 |
| 倾角传感器 | ZCT215M 或 RS-DIP-N01-1H |
| 主控 | RK2206 / 小凌派 |

## 12. 给画板工程师的摘要

```text
设计一块 2 层分节点接口载板，输入 12V，板上提供 12V_SENSOR、5V、3.3V；通过 E53/排针连接 RK2206；提供 GNSS UART 6Pin 接口、XL01 UART 4Pin 接口、Debug UART 4Pin 接口；提供一条 RS485/Modbus RTU 总线，使用 SP3485/MAX3485 或隔离 RS485 收发器，外接两个并联 5Pin 5.08mm 端子，分别给倾角和土壤传感器，端子定义为 12V/GND/A/B/SHIELD；RS485 总线带 TVS、120Ω 终端跳帽、偏置电阻跳帽和测试点；预留 SC16IS752 或 UART 扩展接口，以防 RK2206 串口不足。V0 不集成 GNSS 射频、不集成传感器裸芯片、不保留 MPU6050 正式接口。
```
