# RK2206 滑坡监测系统 - 当前引脚真值

## 适用范围

本文件只记录**当前工程应采用的单一引脚真值**。

如果其他 GPS / UART 方案文档与本文件冲突：

- 以本文件为准
- 以当前编译代码为准

## 1. 当前接口分配

| 模块 | 接口 | 引脚 | GPIO | 当前状态 |
| --- | --- | --- | --- | --- |
| XL01 | `EUART2_M1` | `PB2 / PB3` | `GPIO0_PB2 / GPIO0_PB3` | 已测试 |
| GPS | `EUART0_M0` | `PB6 / PB7` | `GPIO0_PB6 / GPIO0_PB7` | 当前代码真值，待真机复验 |
| MPU6050 / SHT30 | `EI2C0_M0` | `PB4 / PB5` | `GPIO0_PB4 / GPIO0_PB5` | 当前代码真值 |

## 2. 当前代码宏

```c
#define XL01_UART_ID        EUART2_M1
#define XL01_BAUDRATE       115200

#define GPS_UART_ID         EUART0_M0
#define GPS_BAUDRATE        9600

#define I2C_IDX             EI2C0_M0
#define I2C_BAUDRATE        EI2C_FRE_100K
```

## 3. 接线真值

### XL01

```text
XL01 RX -> PB2
XL01 TX -> PB3
XL01 VCC -> 3.3V
XL01 GND -> GND
```

### GPS

```text
GPS TX -> PB6
GPS RX -> PB7
GPS VCC -> 3.3V
GPS GND -> GND
```

### MPU6050 / SHT30

```text
SDA -> PB4
SCL -> PB5
VCC -> 3.3V
GND -> GND
```

## 4. 重要说明

### 4.1 当前为什么不是 A6 / A7 或 C6 / C7

当前并不是说 `A6/A7` 或 `C6/C7` 永远不可能使用，而是：

- 它们没有成为当前实际编译代码的统一真值
- 所以当前阶段不得再按那些历史候选方案接线

### 4.2 当前为什么先以代码真值为准

当前真实参与编译的代码里：

- I2C 已迁到 `PB4 / PB5`
- GPS 当前写成 `PB6 / PB7`

因此当前工程真值应先统一到：

- GPS `PB6 / PB7`
- I2C `PB4 / PB5`

而不是继续保留多套候选文档。

## 5. 当前用途

本文件用于：

- 现场接线
- 代码修改前核对
- 真机 smoke 前确认

不再用于：

- 保留多个 GPS 候选方案
- 继续讨论历史引脚试错记录
