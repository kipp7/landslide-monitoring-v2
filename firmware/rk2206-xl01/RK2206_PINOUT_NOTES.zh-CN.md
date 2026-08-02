# RK2206 现场节点引脚核对说明

## 当前硬件架构

compact V4 现场节点只使用四条外设路径：

| 路径 | 引脚 | 设备 | 说明 |
| --- | --- | --- | --- |
| `EUART2_M1` | PB2/PB3 | XLS1 | 115200 bit/s，承载轮询遥测和有限 RTCM 会话 |
| `EUART0_M0` | PB6/PB7 | UM220-IV NK | 115200 bit/s，解析 NMEA 并按受控会话注入 RTCM |
| `EI2C0_M0` | PB4/PB5 | SC16IS752 | 100 kHz，将两路 RS485 传感器接入 RK2206 |
| SARADC0 | PC0 | 电池分压 | 只读模拟输入，按节点使用已验收校准参数 |

PB4/PB5 上的设备不是 MPU6050 或 SHT30。当前载板通过 SC16IS752 扩展两路 UART：

- channel A：RS-ECTH-N01-TR-1 三合一土壤温度、水分、电导率探头；
- channel B：RS-DIP-N01-1 三轴倾角传感器。

旧 MPU6050、SHT30、ATGM336H 和 9600 bit/s GPS 说明均属于历史方案，不得据此接线或恢复编译。

## SDK 复用真值

当前 RK2206 SDK HAL 必须满足：

- `EUART2_M1`：RX PB2、TX PB3、`MUX_FUNC3`、UART2/M1；
- `EUART0_M0`：RX PB6、TX PB7、`MUX_FUNC2`、UART0/M0；
- `EI2C0_M0`：SCL PB5、SDA PB4、`MUX_FUNC4`、I2C0/M0、方向保持；
- ADC channel 0：PC0、`MUX_FUNC1`、输入方向。

固件不得绕过这些 BSP 路径直接控制 PB2..PB7 或 PC0。

## 上电前检查

1. 断电状态下确认 RK2206 插针没有横向或纵向错位。
2. 确认 XLS1、UM220、SC16IS752 和 RK2206 共地。
3. 确认 PB4 到 SC16IS752 SDA、PB5 到 SCL 导通，且没有对地短路。
4. 确认 PC0 只连接电池分压输出，没有外部推挽信号。
5. 接通载板后，PB4/PB5 的 I2C 空闲电平应接近 3.3 V；异常时立即断电排查。

## 启动日志判据

正确的 V4 hardware 固件启动日志应同时表明：

- XLS1：`EUART2_M1 PB2/PB3`；
- GNSS：`EUART0_M0 PB6/PB7`、115200；
- RS485：`SC16IS752 over EI2C0_M0 PB4/PB5`；
- field sensor source：`HARDWARE`；
- battery：`PC0/SARADC-ch0 input-only`、`field-calibrated`；
- RTCM capability：LIVE，但启动状态必须为 `DISABLED`。

启动成功本身不等于传感器验收通过。明天烧录后仍需检查 A/B/C 身份、硬件土壤/EC/三轴倾角、电池质量、V4 139 B payload，并依次完成 60/600/1800 秒门禁。

## 自动校验

```powershell
pwsh -File scripts/firmware/test-rk2206-pin-safety.ps1
pwsh -File scripts/firmware/test-rk2206-pin-safety-negative.ps1
pwsh -File scripts/firmware/verify-rk2206-release-safety.ps1 -ReleaseDirectory <发布目录>
```

这三道检查分别防止 SDK 引脚漂移、负向门禁失效和发布包身份/模式/哈希不一致。
