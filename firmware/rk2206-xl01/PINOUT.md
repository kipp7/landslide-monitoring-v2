# RK2206 现场节点引脚真值

## 适用范围

本文记录 compact V4 生产固件的唯一引脚真值。若历史文档与本文冲突，以当前 `BUILD.gn`、`app_config.h` 和 RK2206 SDK HAL 为准。

## 接口分配

| 功能 | BSP 接口 | RK2206 引脚 | 参数 | 生产状态 |
| --- | --- | --- | --- | --- |
| XLS1 无线链路 | `EUART2_M1` | `PB2=RX`、`PB3=TX` | 115200 bit/s | 启用 |
| UM220-IV NK GNSS | `EUART0_M0` | `PB6=RX`、`PB7=TX` | 115200 bit/s | 启用 |
| SC16IS752 双路 UART | `EI2C0_M0` | `PB4=SDA`、`PB5=SCL` | 100 kHz，地址 `0x4D` | 启用 |
| 电池采样 | SARADC channel 0 | `PC0` | 模拟输入 | 启用 |

SC16IS752 的 UART A 接三合一土壤探头，UART B 接 RS-DIP-N01-1 三轴倾角传感器。PB4/PB5 不再连接或编译 MPU6050、SHT30；空气温湿度和 MPU6050 数据不属于 compact V4 遥测契约。

## 接线方向

```text
XLS1 TX  -> PB2 (RK2206 RX)
XLS1 RX  -> PB3 (RK2206 TX)

UM220 TX -> PB6 (RK2206 RX)
UM220 RX -> PB7 (RK2206 TX)

SC16IS752 SDA -> PB4
SC16IS752 SCL -> PB5

电池分压输出 -> PC0
```

所有模块必须共地。XLS1 和 UM220 的 UART 为交叉连接；PB4/PB5 为 I2C，不得作为普通 GPIO、PWM、SPI 或另一组 UART 使用；PC0 只允许走 SDK 的 ADC 输入路径。

## 固件真值

```c
#define XL01_UART_ID        EUART2_M1
#define XL01_BAUDRATE       115200

#define GPS_UART_ID         EUART0_M0
#define GPS_BAUDRATE        115200

#define I2C_IDX             EI2C0_M0
#define I2C_BAUDRATE        EI2C_FRE_100K

#define BATTERY_ADC_CHANNEL 0U
```

生产 `BUILD.gn` 必须包含真实 `gps_driver.c`、SC16IS752/RS485 驱动和 `battery_monitor.c`，不得编译 `mpu6050_driver.c`、`sht30_driver.c`、旧 `gps_module.c` 或旧聚合 `sensors.c`。

## 自动门禁

构建或发布前运行：

```powershell
pwsh -File scripts/firmware/test-rk2206-pin-safety.ps1
pwsh -File scripts/firmware/test-rk2206-pin-safety-negative.ps1
```

门禁同时检查应用配置、实际编译源、SDK UART/I2C/ADC 复用和方向；任何引脚、复用功能或退役传感器源漂移都会失败。
