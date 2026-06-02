---
title: RK2206 XLS1 RS485 edge node baseline
type: note
tags:
- reference
- hardware
- rk2206
- xls1
- rs485
status: active
permalink: landslide-monitoring-v2-mainline/memory/references/rk2206-xls1-rs485-edge-node-baseline
---

# Reference: RK2206 XLS1 RS485 edge node baseline

## Purpose

记录新版边缘节点 RK2206 + XLS1/XL01 无线链路 + RS485 传感器的稳定硬件、固件、协议和授时上下文。后续排查 RK3568 field-gateway、RK2206 固件、系统监控 ACK/遥测展示时，以此为硬件侧事实基线。

## Commands

```text
F:\2\openharmony\txsmartropenharmony\vendor\isoftstone\rk2206\samples\xl01_landslide_monitor_v1.1
hb build -f
```

`hb build -f` 需要在 OpenHarmony 编译环境/容器中执行，Windows PowerShell 当前没有 `hb` 命令。

## Files

- `services/field-gateway/src/index.ts`：RK3568 到 RK2206 的 field-link command/telemetry/ack 处理入口。
- `services/field-gateway/src/field-link.ts`：COBS + CRC v1 field-link 帧编码/解码。
- `docs/integrations/mqtt/schemas/device-command.v1.schema.json`：中心到 RK3568 MQTT 命令 schema。
- `docs/integrations/mqtt/schemas/device-command-ack.v1.schema.json`：RK2206/RK3568 到中心的命令 ACK schema。

## Hardware Baseline

- 新 PCB 已打板并调通。
- 边缘节点使用 RK2206。
- 无线模块新版板上用 XLS1，等价于 XL01 贴片版本，串口透明传输。
- RK2206 侧 XLS1/XL01 串口为 `EUART2_M1 PB2/PB3`，波特率 `115200`。
- XLS1/XL01 已配置成功：网络 ID `0x00b3`，信道 `12`，节点地址示例 `0x0002`。
- 之前 XLS1/XL01 配置失败原因是 RX/TX 接反，调换后正常。
- RK2206 与中心节点使用现有 field-link 帧协议：COBS + CRC v1。
- v1.1 没有破坏 v1.0 的 XL01/ACK/命令协议。
- v1.1 中关键通信代码与 v1.0 一致：`command_ack_builder.c`、`device_command_parser.c`、`shared_port_scheduler.c`、`xl01_driver.c`、`field_link_frame.c`。

## Firmware Baseline

- 当前 RK2206 软件路径：`F:\2\openharmony\txsmartropenharmony\vendor\isoftstone\rk2206\samples\xl01_landslide_monitor_v1.1`
- 固件版本标记：`FIRMWARE_SAMPLE_VERSION = "v1.1-um220-rs485"`
- 接收诊断标记：`FW_RX_DIAG_MARKER = "fw-rs485-production-poll-gps-20260508"`
- 当前模式为下拉/轮询上传，不再每 5 秒主动上传。
- `app_config.h`: `EDGE_UPLINK_MODE = EDGE_UPLINK_MODE_POLLED`
- 本地传感器仍持续采集刷新，默认采样间隔 `1s`。
- 只有中心节点/RK3568 下发 `poll_latest_telemetry` 或 `manual_collect` 时，RK2206 才回传最新遥测。
- 启动串口应看到：`Edge Uplink Mode: Polled`

## RS485 And Sensors

- 新 PCB 已加 SC16IS752 双串口扩展和两路隔离 RS485 模块。
- SC16IS752 走 `EI2C0_M0 PB4/PB5`。
- SC16IS752 实际地址：`0x4D`。
- 重点错误：SC16IS752 模块实际有效晶振是 `1.8432MHz`，不是最初以为的 `14.7456MHz`。
- `SC16IS752_XTAL_HZ = 1843200UL`
- RS485 波特率 `4800`，数据格式 `8N1`，协议 Modbus RTU。
- `RS485_CHANNEL_1 = 0`，SC16IS752 UART A -> U5 -> J6。
- `RS485_CHANNEL_2 = 1`，SC16IS752 UART B -> U8 -> J7。

土壤温湿度传感器：

- 型号文档：`3458812510土壤温度水分变送器 485型使用说明书.pdf`
- 当前现场接法：已与倾角传感器合到 `RS485_CHANNEL_2` 一路 4800 RS485 总线。
- 地址 `1`，功能码 `03`，寄存器 `0x0000/0x0001`，缩放 `/10`。
- 当前已读通：`temp=25.x C`，`moisture=0.0%`。

倾角传感器：

- 型号文档：`3458866111倾角变送器（485型）使用说明书.pdf`
- 当前现场接法：已与土壤温度水分传感器合到 `RS485_CHANNEL_2` 一路 4800 RS485 总线。
- 地址 `1`，功能码 `03`，寄存器 `0x0000/0x0001/0x0002`，缩放 `/100`。
- 当前已读通：`x≈1.25~1.32 deg`，`y≈0.05~0.35 deg`，`z≈0.00~0.05 deg`。

GPS：

- 模块：UM220-IV NK。
- RK2206 串口：`EUART0_M0 PB6/PB7`，波特率 `115200`。
- 已接入并能解析经纬度。
- 串口输出 `GPS:NO` 表示暂时未定位，不代表驱动未接入。
- 出现 `GPS:(22.681519,110.195541)` 表示定位成功。

## Telemetry Baseline

当前遥测示例：

```text
[SEND #29] 590 bytes device=00000000-0000-0000-0000-000000000001 (sent)
  Temp:25.9C Humi:0.0% Soil:25.9C/0.0% Tilt:1.32/0.06/0.05deg Rain:N/A GPS:(22.681519,110.195541)
```

- `Temp/Humi` 当前来自土壤温湿度映射，不是 SHT30。
- SHT30 已关闭。
- Rain 预留，当前关闭。
- MPU6050 当前关闭。

RK3568/中心节点至少需要解析以下遥测字段：

- `schema_version`
- `device_id`
- `event_ts`
- `seq`
- `metrics.temperature_c`
- `metrics.humidity_pct`
- `metrics.soil_temperature_c`
- `metrics.soil_moisture_pct`
- `metrics.tilt_x_deg`
- `metrics.tilt_y_deg`
- `metrics.tilt_z_deg`
- `metrics.warning_flag`
- `metrics.gps_latitude`
- `metrics.gps_longitude`
- `meta.uptime_s`
- `meta.last_command_type`
- `meta.last_command_id`
- `meta.upload_trigger`
- `meta.legacy_valid_flags`

## ACK And Commands

- 后台命令 ACK 逻辑保留，和 v1.0 一致。
- 支持命令：`ping`、`set_config`、`set_sampling_interval`、`manual_collect`、`poll_latest_telemetry`、`reboot`、`restart_device`、`deactivate_device`、`motor_start`、`motor_stop`、`buzzer_on`、`buzzer_off`。
- 普通遥测链路 ACK 检查当前关闭：`ENABLE_ACK_CHECK = 0`。
- `ENABLE_ACK_CHECK = 0` 表示普通遥测发送后不等待中心节点返回链路 ACK，不等于后台命令 ACK 关闭。
- 命令 ACK 仍会返回。
- ACK 和普通遥测共用 XL01/XLS1 串口。
- 代码中有静默窗口避免 ACK 后立刻跟遥测混在一起：`PLATFORM_POST_ACK_QUIET_MS = 1200`，`PLATFORM_MANUAL_COLLECT_DELAY_MS = 1500`。
- RK3568 收到 RK2206 命令 ACK 后不要把 ACK 当传感器数据。ACK 是 `FIELD_LINK_FRAME_TYPE_ACK`，遥测是 `FIELD_LINK_FRAME_TYPE_TELEMETRY`。

## Polling Logic

- RK2206 本地每 `1s` 采集传感器。
- RK2206 不主动周期性上传。
- 中心节点/RK3568 应定时向 RK2206 发送 `poll_latest_telemetry`。
- RK2206 收到后先回 ACK，再触发一次最新遥测上传。
- `manual_collect` 也可以触发采集/上传。
- 中心节点要按节点地址轮询 RK2206/XLS1。

## Time Sync Decision

正式授时优先级：

1. RK3568 下发时间。
2. GPS RMC UTC 时间。
3. RK2206 uptime 相对时间。

当前状态：

- RK2206 没有可靠真实时间同步。
- 遥测 JSON 中 `event_ts` 当前是 `null`。
- RK2206 只有 `uptime_s`。
- ACK 时间戳会尝试 `time(NULL)`；如果系统时钟未同步，则退回 uptime 生成的占位北京时间，不能当真实采样时间。
- GPS 已解析 RMC/GGA 经纬度，但还没有把 RMC UTC 日期时间接入 `event_ts`。

推荐实现：

- RK3568 通过 NTP/系统时间保持可信。
- RK3568 下发 `poll_latest_telemetry` 或 `manual_collect` 时，在真正写入 field-link command 帧前带上 `sent_ts`/`gateway_sent_ts`。
- RK2206 收到命令后用 `sent_ts` 校准/记录当前可信时间。
- RK2206 回传遥测时填 `event_ts`，ACK 填可信 `ack_ts`。
- 若没有 RK3568 时间但 GPS 有 RMC UTC 时间，使用 GPS 作为备用。
- 若两者都没有，`event_ts` 保持 `null`，保留 `uptime_s`。

建议下发格式：

```json
{
  "schema_version": 1,
  "command_id": "cmd-001",
  "device_id": "00000000-0000-0000-0000-000000000001",
  "command_type": "poll_latest_telemetry",
  "issued_ts": "2026-05-08T14:29:59.800+08:00",
  "sent_ts": "2026-05-08T14:30:00.000+08:00",
  "gateway_sent_ts": "2026-05-08T14:30:00.000+08:00",
  "time_sync": {
    "source": "rk3568_gateway",
    "sent_ts": "2026-05-08T14:30:00.000+08:00",
    "issued_ts": "2026-05-08T14:29:59.800+08:00"
  },
  "payload": {}
}
```

## Hardware Notes

- XLS1 是 XL01 的贴片版本，IPEX 天线接口。
- 天线建议买对应频段的 IPEX 外置天线，优先选硬杆/胶棒式。
- 不想用软线就不要选长软线延长天线。
- Modbus RTU 是跑在 RS485 物理层上的协议。

## 2026-05-11 RS485 Alarm Beacon Decision

- 用户已将两个 `4800 8N1` 传感器合到 `RS485_CHANNEL_2` 一路 RS485 总线，因此 0001 的另一条 `RS485_CHANNEL_1` 可独立用于声光报警器。
- 当前固件调整方向：
  - 土壤温度/水分与倾角传感器共用 `RS485_CHANNEL_2`，仍为 `4800 8N1`。
  - 声光报警器独占 `RS485_CHANNEL_1`，按厂家资料使用 `9600 8N1`。
  - 报警器配置文件建议为 `130010`：模式 1、音量 30、地址 01、播放时爆闪。
- 厂家资料关键控制命令：
  - Modbus RTU 功能码 `06` 写单寄存器。
  - 播放：寄存器 `0x000D`，值 `0x0000`。
  - 暂停：寄存器 `0x000E`，值 `0x0000`。
  - 资料示例使用 `FF 06 ...`，固件优先按配置地址 `0x01` 写入，失败后尝试 `0xFF` fallback。
- 代码状态：
  - `drivers/sensors/rs485_modbus.c/.h` 已新增 `RS485_ModbusWriteSingleRegisterOnChannel`。
  - `drivers/sensors/field_alarm_rs485.c/.h` 已新增报警器 RS485 控制驱动。
  - `main/landslide_main.c` 中 `buzzer_on` / `buzzer_off` 已接入报警器 RS485 播放/暂停，并在 ACK 中返回 `alarm_transport=rs485_modbus`。
  - `BUILD.gn` 已加入 `field_alarm_rs485.c`。
  - OpenHarmony 容器内 `hb build -f` 已通过，产物为 `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`。
- 注意：
  - 土壤和倾角如果共用同一条 485 总线，Modbus 地址不能相同；如果两者仍都是厂家默认地址 `1`，需要先改其中一个地址，否则会抢答。
  - 用户确认尚未改地址，当前 `app_config.h` 里 `RS485_SOIL_ADDR=1`、`RS485_TILT_ADDR=1`，代码不擅自改地址；现场若同时接入两台传感器，必须先把其中一台传感器地址改掉再同步代码宏。

## 2026-05-11 RS485 Alarm Beacon Diagnostics

- 复测 0001 实时状态时，`legacy_valid_flags.tilt_ok=1`，`tilt_x_deg=0.17`，`tilt_y_deg=0.55`，说明 0001 的 `RS485_CHANNEL_2 / 4800` 传感器总线仍能读到倾角数据。
- 因倾角走 `RS485_CHANNEL_2`，报警器走 `RS485_CHANNEL_1`，倾角正常只能排除传感器总线 A/B 反接，不能排除报警器独立通道 A/B、地址、波特率或设备配置问题。
- 直接 API 复发 `buzzer_on` 命令 `7690f313-0781-4ca9-8fa7-97dad364c748`，RK3568 field-gateway 已转发到 0001，0001 返回命令 ACK，状态为 `failed`，结果仍为 `rs485_alarm_on_failed`。
- 结论：平台 API、Kafka、RK3568、XLS1 到 RK2206 下行链路可用；失败发生在 RK2206 到 RS485 声光报警器的 Modbus 写单寄存器段。
- 已新增诊断固件能力：
  - `RS485_ModbusWriteSingleRegisterOnChannel` 返回细分错误码：写出失败、TX 未完成、无完整响应、地址不符、CRC 错、异常响应、回显不一致。
  - `FieldAlarmRs485_GetLastDiag()` 保存报警器最近一次控制的通道、波特率、主地址、fallback 地址、寄存器、主地址结果、fallback 结果、最终结果。
  - `buzzer_on` / `buzzer_off` 失败 ACK 会带 `alarm_diag`，便于烧录后远程判断到底是总线无响应、协议不匹配还是通道写出异常。
- OpenHarmony 容器内 `hb build -f` 已通过，诊断版产物仍为 `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`，时间戳 `2026-05-11 07:04:42`。
- 用户烧录诊断版后复测 `buzzer_on` 命令 `d3dd5d30-1ef4-4bb0-bd5e-e811e5bc4172`：
  - 主地址 `0x01`：`timeout_or_no_full_response`。
  - fallback 地址 `0xFF`：收到响应但被判 `unexpected_slave_addr`。
  - 这说明报警器很可能按厂家示例接受 `0xFF` 控制入口，但回包使用真实地址 `0x01`。
- 已新增报警器专用兼容逻辑：
  - 普通 Modbus 写单寄存器仍严格要求回包地址等于发送地址。
  - 报警器 fallback 路径改为发送地址 `0xFF`，期望回包地址 `0x01`。
  - 回显校验改为校验功能码、寄存器、值和 CRC，不再要求发送地址与回包地址完全一致。
- OpenHarmony 容器内 `hb build -f` 再次通过，兼容版产物仍为 `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`，时间戳 `2026-05-11 07:08:38`。
- 继续复测时先发 `ping`，命令 `f1f0edd9-a943-4285-939c-4aac921f48dd` 已 `acked`，说明 0001 并非完全离线。
- 再次下发报警命令：
  - `buzzer_on` 命令 `2b0bbc50-648e-4930-a78b-f7c28cddeb6a` 返回 `failed`，诊断为 `primary=unexpected_slave_addr`、`fallback_result=timeout_or_no_full_response`、`final=timeout_or_no_full_response`。
  - `buzzer_off` 命令 `318e0aba-5cef-45a6-9c0d-00dcd8e35efa` 返回同类诊断。
- 结论：报警器通道上仍能收到某种合法长度响应，但地址兼容行为不稳定，不能只固定为 `FF->01`。
- 已进一步调整为报警器专用宽松地址回包：
  - 报警器通道允许 `0x01` 或 `0xFF` 作为合法回包地址。
  - 仍必须校验 CRC、功能码、寄存器地址和值。
  - 普通传感器 Modbus 读写不放宽。
- OpenHarmony 容器内 `hb build -f` 通过，宽松地址兼容版产物仍为 `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`，时间戳 `2026-05-11 07:14:43`。

## 2026-05-11 Alarm Beacon Retry And Raw Response Diagnostics

- 复测链路：
  - `ping` 命令 `a59f3d39-fd26-4335-bb4a-09f997996ab0` 已 `acked`，结果 `pong=true`。
  - `buzzer_on` 命令 `06efcbbd-b07e-460d-87cf-820002ae0fb4` 已到达 0001，但返回 `failed`。
  - `buzzer_off` 命令 `9e59281c-69ed-416a-978b-9fce01c28fbc` 已到达 0001，但返回 `failed`。
- 本次回执：
  - `buzzer_on`：`primary=unexpected_slave_addr`，`fallback_result=crc_mismatch`，`final=crc_mismatch`。
  - `buzzer_off`：`primary=unexpected_slave_addr`，`fallback_result=unexpected_slave_addr`，`final=unexpected_slave_addr`。
- 当前结论：
  - 平台 API、Kafka、command-dispatcher、MQTT、RK3568 field-gateway、XLS1 到 0001 的下发链路仍然成立。
  - 失败继续集中在 0001 到 RS485 声光报警器的 Modbus 回包校验段。
  - 当前已烧版本仍未在 ACK 中带 `primary_rx_addr` / `primary_rx_bytes` 等新诊断字段，因此需要烧录更新后的诊断镜像再复测。
- 已新增更细诊断：
  - `RS485_ModbusGetLastWriteResponse()` 可取最近一次写单寄存器响应的原始字节。
  - `FieldAlarmRs485Diag` 新增 `primary_rx_hex` / `fallback_rx_hex`。
  - `buzzer_on` / `buzzer_off` 失败 ACK 会携带回包首字节、字节数和原始十六进制，便于判断地址、CRC、回显或厂家协议差异。
- OpenHarmony 容器内 `hb build -f` 已通过。
- 新诊断镜像：
  - `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`
  - 时间戳：`2026-05-11 07:40:51`
  - 大小：`2097152` bytes

## 2026-05-11 Alarm Beacon ACK Size Fix

- 用户烧录 `2026-05-11 07:40:51` 诊断镜像后复测：
  - `ping` 命令 `0cd42780-2504-448c-b268-4f1d1522d78d` 已 `acked`。
  - `buzzer_on` 命令 `8e332396-d1d7-47de-bc91-2e86bf2fcc06` 返回 `failed`，但 result 被平台解析为 `{"detail":"unstructured_result_fragment","time_source":"rk3568_gateway_sent_ts"}`。
  - `buzzer_off` 命令 `f3168bb7-1312-499d-828b-42b601dd0778` 返回 `failed`，但 result 为空对象。
- 结论：
  - 0001 下发链路仍通。
  - 诊断 JSON 字段过长，触发 ACK result 片段截断/解析退化，导致没有拿到原始 RS485 回包。
- 已修复：
  - `BuildAckResultJsonWithTimeSource()` 现在会判断 `snprintf` 截断，截断时返回失败，不再把破损 JSON 当有效 result。
  - 报警器失败 ACK 改为短字段：`ch/baud/addr/fb_addr/reg/p/pa/pb/ph/f/fa/fb/fh/final/used_fb`，保留主地址与 fallback 的返回地址、字节数、原始 hex、最终错误。
- OpenHarmony 容器内 `hb build -f` 已通过。
- 新镜像：
  - `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`
  - 时间戳：`2026-05-11 07:47:30`
  - 大小：`2097152` bytes

## 2026-05-11 Alarm Beacon Direct Channel Init Fix

- 用户复测 `2026-05-11 07:47:30` 镜像后，`ping` 可 ACK，但 `buzzer_on` / `buzzer_off` 仍返回 `failed`。
- 最新失败结果关键字段为：`p=invalid`、`final=invalid`、`reg=0000`、`used_fb=false`、`ph=""`、`fh=""`。
- 结论：报警 Modbus 写入没有真正发出，而是在进入 `FieldAlarmRs485_SetEnabled()` 前被 `main/landslide_main.c` 中的 `!g_rs485_ready ||` 短路。
- 已修复：
  - `buzzer_on` / `buzzer_off` 不再依赖传感器总线全局状态 `g_rs485_ready`。
  - 报警器驱动继续由 `FieldAlarmRs485_PrepareChannel()` 独立初始化 `RS485_ALARM_CHANNEL / RS485_ALARM_BAUDRATE`。
  - 失败仍返回真实 Modbus 诊断，不把报警器失败伪装为 ACK 成功。
  - 固件标记更新为 `fw-rs485-alarm-direct-init-20260511`，便于串口确认烧录版本。
- OpenHarmony 容器内 `hb build -f` 已通过。
- 新镜像：
  - `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`
  - 时间戳：`2026-05-11 07:59:27`
  - 大小：`2097152` bytes
- 下一步：用户烧录该镜像到 0001 后，按 `ping`、`buzzer_on`、`buzzer_off` 顺序复测；如果仍失败，应重点查看 `reg` 是否变为 `000D/000E`，以及 `p/f/final/ph/fh` 是否给出真实总线回包诊断。

## 2026-05-11 YX75R Manual Findings

- 资料文件：`E:\学校\02 项目\99 山体滑坡优化完善\PCB打板\3473038122YX75R ( Modbus RTU协议)使用说明书V1.3(1).pdf`
- 手册确认：
  - 型号：YX75R 声光报警器。
  - 控制方式：485 串口通信，Modbus RTU。
  - 默认 485 地址：`01`。
  - 默认波特率：`9600`。
  - 串口格式：`8N1`，CRC16 Modbus，CRC 低字节在前。
  - 接线标识：黄线 `A+`，绿线 `B-`。
  - `0xFF` 是超级地址，可替换为实际设备地址。
  - 控制命令默认开启返回应答；可通过 `FF 06 00 CA 00 00` 关闭应答，`FF 06 00 CA 00 01` 开启应答。
- 当前固件使用的 `0x0D` / `0x0E`：
  - `0x0D` 是“播放当前曲目”。
  - `0x0E` 是“暂停播放”。
  - 这两条命令 CRC 正确，但语义不是最稳的现场声光报警联动入口。
- 更适合平台联动的命令：
  - 警灯爆闪：`01 06 00 C2 00 03 68 37` 或超级地址 `FF 06 00 C2 00 03 7D E9`。
  - 警灯关闭：`01 06 00 C2 00 06 A8 34` 或超级地址 `FF 06 00 C2 00 06 BD EA`。
  - 停止当前播放：`01 06 00 16 00 01 A9 CE` 或超级地址 `FF 06 00 16 00 01 BC 10`。
  - 查询声光状态：`01 03 00 70 00 00 44 11` 或超级地址 `FF 03 00 70 00 00 51 CF`。
  - 指定 `01` 文件夹 `001` 曲并保持爆闪：`01 06 30 0F 01 01 76 99` 或超级地址 `FF 06 30 0F 01 01 63 47`。
- 复测 `fw-rs485-alarm-direct-init-20260511` 后：
  - `ping` 成功 ACK。
  - `buzzer_on` 已不再停在 `reg=0000`，而是进入 `reg=000D`，说明报警 Modbus 写入已经实际发出。
  - `buzzer_on` 主地址和 fallback 都为 `timeout_or_no_full_response`，说明当前真实问题在报警器 RS485 物理/地址/应答/供电/协议语义侧。
- 下一步固件建议：
  - `buzzer_on` 优先改为发送 `0xC2/0x0003` 让警灯独立爆闪，再发送 `0x0F` 指定语音文件或保留 `0x0D` 播放当前曲目。
  - `buzzer_off` 改为发送 `0xC2/0x0006` 关闭警灯，并发送 `0x16/0x0001` 停止播放。
  - 新增 `0x70` 查询作为诊断命令，判断设备是否在线以及当前声光状态。

## 2026-05-11 YX75R C2 Alarm Firmware

- 已按 YX75R 手册把 `buzzer_on` / `buzzer_off` 的报警器控制语义从旧的 `0x0D/0x0E` 调整为更明确的声光报警组合。
- 固件标记更新为 `fw-yx75r-c2-alarm-20260511`。
- `buzzer_on` 当前执行顺序：
  - step 1：`0xC2 / 0x0003`，独立控制 D1 警灯爆闪。
  - step 2：`0x300F / 0x0101`，播放 `01` 文件夹 `001` 曲目，并保持 D1 爆闪语义。
- `buzzer_off` 当前执行顺序：
  - step 1：`0xC2 / 0x0006`，关闭 D1 警灯。
  - step 2：`0x0016 / 0x0001`，停止当前播放。
- ACK 失败诊断已压缩：
  - 字段包括 `e/s/ch/baud/addr/fb_addr/reg/val/p/pa/pb/f/fa/fb/final/used_fb`。
  - 不再携带长字符串状态名和原始 hex，避免再次触发 `unstructured_result_fragment`。
- 配置常量已加入 `config/app_config.h`：
  - `RS485_ALARM_LIGHT_REG = 0x00C2`
  - `RS485_ALARM_LIGHT_FLASH_VALUE = 0x0003`
  - `RS485_ALARM_LIGHT_OFF_VALUE = 0x0006`
  - `RS485_ALARM_STOP_REG = 0x0016`
  - `RS485_ALARM_STOP_VALUE = 0x0001`
  - `RS485_ALARM_PLAY_FILE_REG = 0x300F`
  - `RS485_ALARM_PLAY_FILE_VALUE = 0x0101`
- OpenHarmony 容器内 `hb build -f` 已通过。
- 新镜像：
  - `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`
  - 时间戳：`2026-05-11 08:20:17`
  - 大小：`2097152` bytes
- 下一步：用户烧录该镜像到 0001 后，平台复测 `ping -> buzzer_on -> buzzer_off`。如果 `buzzer_on` 仍失败，优先看 `reg` 是否为 `00C2`，这能直接判断是否卡在独立警灯爆闪第一步。

## 2026-05-11 YX75R C2 Hex Diagnostics

- 平台复测 `fw-yx75r-c2-alarm-20260511`：
  - `buzzer_on` 命令 `b56eda4b-d5dc-494d-9c31-28bbd515b076` 返回 `failed`。
  - `buzzer_off` 命令 `d47570d4-3ae3-4c03-b3a1-440a7b71130b` 返回 `failed`。
- 当前诊断：
  - `buzzer_on`：`s=1, reg=00C2, val=0003, p=-4, f=-5`。
  - `buzzer_off`：`s=1, reg=00C2, val=0006, p=-5, f=-5, pa=3, pb=8`。
  - 平台链路与 RK2206 命令 ACK 正常，失败集中在 RK2206 到 YX75R 的 RS485 Modbus 闭环。
  - 首要问题不是音频文件没声音，因为第一步独立警灯 `0xC2` 就没有通过。
- 已新增短 hex 诊断固件：
  - `FieldAlarmRs485_FormatLastWriteResponse()` 输出无空格短 hex。
  - `buzzer_on/off` 失败 ACK 携带 `ph` / `fh`，分别表示主地址和 fallback 的原始回包。
  - ACK 删除重复的 `ch/baud/addr/fb_addr`，避免 result 过长。
  - 固件标记：`fw-yx75r-c2-hexdiag-20260511`。
- 新镜像：
  - `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`
  - 时间戳：`2026-05-11 08:37:27`
  - 大小：`2097152` bytes
- 下一步：
  - 用户烧录该镜像到 0001。
  - 复测 `buzzer_on -> buzzer_off`。
  - 根据 `ph/fh` 判断报警器通道是否 A/B 反、接错通道、地址/波特率不一致、总线串扰或厂家回包协议差异。

## 2026-05-11 YX75R Baud Fallback Firmware

- 用户烧录 `fw-yx75r-c2-hexdiag-20260511` 后平台复测：
  - `buzzer_on` 命令 `9fd9c0da-61bd-4c34-93bd-f1f01ea36e50` 返回 `failed`，fallback 回包 `fh=0000000100400100`。
  - `buzzer_off` 命令 `b005a0ee-45e1-4171-b64e-1f8473539b81` 返回 `failed`，主地址回包 `ph=00C1004001004001`，fallback 回包 `fh=0100000000010040`。
  - 这些都不是合法 Modbus 写单寄存器回显；合法回显应接近 `010600C200036837` 或超级地址版本。
- 手册复核：
  - YX75R 出厂默认 9600。
  - 设备支持通过 `0x0B` 设置并记忆波特率。
  - `0x09` 对应 4800。
- 已新增波特率回退固件：
  - `RS485_ALARM_BAUDRATE = 9600`。
  - `RS485_ALARM_BAUDRATE_FALLBACK = 4800`。
  - 每个报警步骤先试 9600，失败后重置报警器通道到 4800 再试。
  - 失败 ACK 携带 `baud`，表示最终诊断对应的波特率。
  - 固件标记：`fw-yx75r-c2-baudscan-20260511`。
- 新镜像：
  - `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`
  - 时间戳：`2026-05-11 08:47:47`
  - 大小：`2097152` bytes
- 下一步：
  - 用户烧录新镜像到 0001。
  - 复测 `buzzer_on -> buzzer_off`。
  - 若 4800 成功，说明 YX75R 被记忆成非默认波特率；若仍失败，优先查报警器是否接在 `RS485_CHANNEL_1 / J6 / U5`、A/B 是否反、独立供电是否足够、设备地址是否仍为 1。

## 2026-05-11 YX75R Baudscan Retest

- 用户烧录 `fw-yx75r-c2-baudscan-20260511` 后复测：
  - `buzzer_on`：`404ba0ff-56ab-4b3c-9352-66bffa853ae6`
  - `buzzer_off`：`a89010ae-e9b2-483c-9308-bc948657e942`
  - `ping`：`da7f66ec-0ae6-4385-9114-4c3eecf211a4`
- 报警命令结果：
  - `buzzer_on`：`failed`, `s=1`, `reg=00C2`, `val=0003`, `baud=4800`, `p=-5`, `ph=0010101010101010`, `f=-4`, `final=-4`。
  - `buzzer_off`：`failed`, `s=1`, `reg=00C2`, `val=0006`, `baud=4800`, `p=-5`, `ph=0010101010101010`, `f=-4`, `final=-4`。
- 结论：
  - 新固件已运行，自动波特率回退路径已进入 4800。
  - 4800 仍没有合法 Modbus 回显，`0010101010101010` 不像 YX75R 合法响应。
  - 后续 `ping` 已 ACK，说明平台到 0001 的下发和 ACK 回灌仍正常。
  - ClickHouse 最近有 0001 倾角遥测：`seq=20`, `tilt_x_deg=0.17`, `tilt_y_deg=0.57`。
  - 当前主故障点已收敛为报警器独立 RS485 物理侧：接线 A/B、通道接错、供电、RS485 模块方向/硬件、设备地址/配置。
- 建议：
  - 不再继续盲目改固件重复发命令。
  - 现场优先确认 YX75R 是否接在 `RS485_CHANNEL_1 / J6 / U5`。
  - 确认黄线 A+、绿线 B- 是否反。
  - 确认 DC 12-24V 独立供电。
  - 如果有 USB-RS485，PC 直连发送 `01 06 00 C2 00 03 68 37`，最快判断报警器本体是否可控。

## 2026-05-11 YX75R USB-RS485 Direct Test Passed

- 用户使用 USB-RS485 串口助手直连 YX75R。
- 串口参数：`9600 8N1`，HEX 发送。
- 用户发送前面给出的 `0xC2` 控制命令。
- 结果：
  - 命令都有反应。
  - 返回 HEX 与预期一致。
- 结论：
  - YX75R 本体可控。
  - 当前地址为 `01`。
  - 当前波特率为 `9600`。
  - 命令和 CRC 正确。
  - 报警器供电在直连测试下足够。
  - 前面 RK2206 侧失败不再优先怀疑报警器本体、波特率、地址或命令。
- 当前主故障点：
  - RK2206 报警器独立 RS485 路径 `RS485_CHANNEL_1 / J6 / U5`。
  - J6 A/B 标识或接线方向。
  - U5 隔离自动收发 RS485 模块。
  - SC16IS752 UART A 映射。
  - 现场实际是否接错通道。
- 下一步建议：
  - USB-RS485 从报警器断开后再接回 RK2206，避免两个主机同时驱动总线。
  - 黄线接 J6 `RS4851_A`，绿线接 J6 `RS4851_B`；若不通，在 J6 端交换 A/B 试一次。
  - 若仍不通，做临时验证：报警器改走 `RS485_CHANNEL_2 / J7 / U8`，用于区分 U5/J6 硬件问题与固件通道问题。

## 2026-05-11 YX75R Always-Play Diagnostic Firmware

- 用户反馈烧录通道扫描版后 `buzzer_on/off` 仍然“不响”。
- 真实 API 复测：
  - `buzzer_on`: `9a31513f-125c-478e-bae5-b1cc5a5eed7d`
  - `buzzer_off`: `93793150-e133-4234-b772-973e62ec8d12`
- ACK 结果：
  - 两条命令均已走到 RK2206 并返回 `failed`。
  - `baud=9600`，说明现场已经不是老的 4800 回退固件。
  - `ch=1`，说明通道扫描固件已运行，最终诊断落在 alternate channel。
  - `ph=""`, `fh=""`, `pb=0`, `fb=0`, `final=-4`，表示没有收到完整 Modbus 回包。
- 关键代码结论：
  - 原 `FieldAlarmRs485_SetEnabled(1)` 先发 `0x00C2=0x0003`，只有收到合法回包才继续发 `0x300F=0x0101` 播放文件。
  - 现场当前症状是 RK2206 侧收不到回包；如果第一步超时就返回，则可能根本没有执行声音播放命令。
- 已修改固件：
  - `buzzer_on` 无论闪灯命令是否收到回包，都继续下发 `0x300F=0x0101`。
  - `buzzer_off` 无论关灯命令是否收到回包，都继续下发 `0x0016=0x0001` 停止命令。
  - 仍不伪造成功；如果 Modbus 回包仍失败，ACK 继续返回失败，便于保持诊断真实。
- 新固件 marker：
  - `fw-yx75r-9600-always-play-20260511`
- 新镜像：
  - `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`
  - 时间戳：`2026-05-11 09:46:25`
  - 大小：`2097152` bytes
- 手工 USB-RS485 参考命令：
  - 闪灯：`01 06 00 C2 00 03 68 37`
  - 播放文件：`01 06 30 0F 01 01 76 99`
  - 关灯：`01 06 00 C2 00 06 A8 34`
  - 停止：`01 06 00 16 00 01 A9 CE`

## 2026-05-11 YX75R Always-Play Burn Retest

- 用户烧录 `fw-yx75r-9600-always-play-20260511` 后要求复测。
- 真实 API 下发：
  - `buzzer_on`: `d29290dc-94d0-46e0-a32c-5923ef39aed9`
  - `buzzer_off`: `a5bb413d-d321-460a-9721-4085bf4fb899`
- 结果：
  - 两条命令均由 command dispatcher 下发到 `cmd/00000000-0000-0000-0000-000000000001`。
  - 两条命令均收到 RK2206 ACK，但状态均为 `failed`。
- `buzzer_on` ACK：
  - `s=2`
  - `reg=300F`
  - `val=0101`
  - `baud=9600`
  - `ch=1`
  - `ph=0101400101400101`
  - `p=-6`
  - `final=-4`
- `buzzer_off` ACK：
  - `s=2`
  - `reg=0016`
  - `val=0001`
  - `baud=9600`
  - `ch=1`
  - `ph=00C1004001014001`
  - `fh=010101`
  - `p=-5`
  - `f=-4`
  - `final=-4`
- 结论：
  - 新版 always-play 固件已经生效，播放/停止命令确实执行到了第 2 步。
  - 故障不再是“第一步无回包导致第二步没发”。
  - 当前回包不是合法 YX75R Modbus 回显，而是畸形/噪声/错误通道数据。
  - 若现场仍不响，下一步优先做 SC16IS752 外部 loopback、通道接线实测或用 USB-RS485 旁路监听 RK2206 实际发出的总线字节。

## 2026-05-11 YX75R Raw TX Diagnostic Firmware

- 用户确认 always-play 烧录后仍然没有响。
- 当前结论：
  - 平台下发、RK3568 转发、RK2206 命令解析和 ACK 回传均正常。
  - YX75R 本体、地址 `01`、`9600 8N1`、厂家 HEX 命令均已由 USB-RS485 直连验证。
  - always-play 已证明第二步播放命令执行到了，但现场仍不响。
  - 故障应继续收敛到 RK2206 侧 RS485 TX 是否真正到达 YX75R 总线。
- 已新增原始发送诊断能力：
  - `RS485_ModbusRawWriteOnChannel(...)`
  - `FieldAlarmRs485_SendRawDiagnostic(int enabled)`
  - 平台命令：
    - `buzzer_raw_on`
    - `buzzer_raw_off`
- `buzzer_raw_on` 行为：
  - 在配置报警通道和 alternate 通道分别发送：
    - `01 06 00 C2 00 03 68 37`
    - `01 06 30 0F 01 01 76 99`
  - 不等待合法 Modbus 回包，不做设备响应校验，只验证 TX 输出。
- `buzzer_raw_off` 行为：
  - 在配置报警通道和 alternate 通道分别发送：
    - `01 06 00 C2 00 06 A8 34`
    - `01 06 00 16 00 01 A9 CE`
- 串口日志会打印：
  - `[RS485 RAW TX ch=...]`
  - `[ALARM RAW] ch=... first=... second=...`
- 新固件 marker：
  - `fw-yx75r-raw-tx-diag-20260511`
- 新镜像：
  - `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`
  - 时间戳：`2026-05-11 09:57:18`
  - 大小：`2097152` bytes
- 下一步现场判断：
  - 烧录后直接发 `buzzer_raw_on`。
  - 如果响，说明正式 Modbus 校验/回包链路有问题，但 TX 可达，可继续做“发送成功但回包不可信”的业务策略。
  - 如果仍不响，用 USB-RS485 旁路监听总线是否出现 `01 06 30 0F 01 01 76 99`。
  - 如果监听不到，查 RK2206 到 RS485 模块 TX、SC16IS752 通道、U5/J6 硬件路径。
  - 如果监听得到但不响，查 YX75R 实际接线端、A/B、供电共地/隔离模块方向、是否两个主机并线。

## 2026-05-08 Burn Validation

- RK2206 v1.1 授时固件已由用户烧录到现场 `0001` 节点。
- 烧录后中心侧看到 `seq` 从旧固件的 `667/668/669/670` 重置为 `1..`，确认新镜像已运行。
- 遥测 `event_ts` 已从旧固件的 `NULL` 变为 RK3568 下发的 `gateway_sent_ts`：
  - `seq=1 event_ts=2026-05-08 11:29:06.096Z`
  - `seq=10 event_ts=2026-05-08 11:32:30.811Z`
  - `seq=71 event_ts=2026-05-08 11:42:19.649Z`
- API 业务命令闭环已实机通过：
  - command `b4d0f7e1-445e-450e-912c-c787d0e46d23`
  - command `69826bc6-deab-4f7f-8d2d-50c8bd4201b1`
  - `status=acked`
  - `result.time_source=rk3568_gateway_sent_ts`
  - `command-ack-receiver normalized=false`
- 这说明 RK3568 下发授时、RK2206 解析授时、ACK 回灌和遥测 `event_ts` 入库已经闭环。

## 2026-05-11 YX75R Passive Listen Result and Clean Single-Channel Firmware

- 用户使用 USB-RS485 旁路监听 RK2206 -> YX75R 总线。
- 监听结果出现：
  - `FF 06 00 C2 00 03 7D E9`
  - `FF 06 30 0F 01 01 ...`
  - `FF 06 00 C2 00 06 BD EA`
  - `FF 06 00 16 00 01 ...`
- 结论：
  - 总线不是完全没 TX；RK2206/SC16IS752 已经有字节输出。
  - `FF 06...` 不是 YX75R 回包，而是固件中 `RS485_ALARM_ADDR_FALLBACK=0xFF` 导致的 fallback 写命令。
  - 同时 `RS485_ALARM_CHANNEL_SCAN=1` 会在失败后扫 alternate channel，可能污染 4800 传感器通道，也让旁听结果混入非 YX75R 字节。
- 已修正固件配置：
  - `RS485_ALARM_CHANNEL_SCAN=0`
  - `RS485_ALARM_ADDR_FALLBACK=RS485_ALARM_ADDR`
  - 正式 `buzzer_on/off` 只走 `RS485_ALARM_CHANNEL / RS485_CHANNEL_1 / J6 / U5`。
  - 正式 `buzzer_on/off` 只发地址 `01`，不再发地址 `FF`，不再扫 channel 2。
- 新固件 marker：
  - `fw-yx75r-clean-single-ch-20260511`
- 新镜像：
  - `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`
  - 时间戳：`2026-05-11 10:14:40`
  - 大小：`2097152` bytes
- 下一步：
  - 烧录 clean single-channel 固件。
  - 启动串口确认 marker 为 `fw-yx75r-clean-single-ch-20260511`。
  - 保持 USB-RS485 旁路监听，再测正式 `buzzer_on/off`。
  - 预期旁听只应看到地址 `01` 的四条 YX75R 命令，不应再出现 `FF 06...`。

## 2026-05-11 YX75R Clean Single-Channel Passive Listen Confirmed

- 用户烧录/复测 clean single-channel 后，USB-RS485 旁路监听到完整厂家命令：
  - `01 06 00 C2 00 03 68 37`
  - `01 06 30 0F 01 01 76 99`
  - `01 06 00 C2 00 06 A8 34`
  - `01 06 00 16 00 01 A9 CE`
- 结论：
  - RK2206 -> SC16IS752 -> RS485 TX 已经能输出正确 YX75R Modbus RTU 帧。
  - 不应继续优先怀疑命令值、CRC、波特率、SC16IS752 晶振或 XL01 截断。
  - 当前未响更可能是 YX75R 接入物理层问题：A/B 命名相反、YX75R 未实际并到同一对总线、旁听点与 YX75R 端子不一致、供电/隔离/工作模式/音频文件或音量问题。
- 下一步建议：
  - 优先把 YX75R A/B 对调后复测。
  - 或把 USB-RS485 旁听点移动到 YX75R 端子旁边，确认 YX75R 端子上也能看到完整四条命令。

## 2026-05-11 YX75R Same-Bus PC Injection Works

- 用户确认：保持现场同一组线路，用 PC/USB-RS485 直接发送厂家命令，YX75R 可以正常爆闪。
- 结合此前 RK2206 发送同样帧、USB-RS485 可旁听到完整正确 HEX，但 YX75R 不动作：
  - 软件协议层基本排除。
  - YX75R 设备、地址、波特率、命令、CRC、端子完全错误基本排除。
  - 当前问题收敛到 RK2206 侧 RS485 输出电气层。
- 重点怀疑：
  - RK2206 当前自动收发 RS485 模块驱动能力/差分幅度不足。
  - USB-RS485 旁听器负载或终端/偏置改变总线。
  - 自动方向保持时间/DE-RE 时序不够稳。
  - 隔离模块参考地、供电、端接/偏置导致 YX75R 接收器不识别。
- 下一步：
  - 拔掉 USB-RS485 旁听器，只保留 RK2206 -> YX75R 复测。
  - 若仍不爆闪，优先更换 RS485 模块或改用带 DE/RE 可控的收发器方案。

## 2026-05-11 YX75R No USB Listener Still No Action

- 用户确认去掉 USB-RS485 旁听器后，RK2206 触发 YX75R 仍无爆闪/声音。
- 结论：
  - 不是 USB-RS485 旁听器负载导致。
  - 问题继续收敛到 RK2206 当前 RS485 输出电气层或自动方向时序。
- 建议下一步：
  - 临时把 YX75R 接到 J7/channel2，断开 channel2 的土壤/倾角传感器。
  - 编译一版 `RS485_ALARM_CHANNEL=RS485_CHANNEL_2` 测试固件。
  - 若 channel2 能触发，说明 U5/J6/channel1 问题。
  - 若 channel2 也不能触发，说明当前自动方向 RS485 模块与 YX75R 兼容性/驱动能力不足，应换 DE/RE 可控 RS485 或转到 RK3568 侧 USB-RS485/工业串口网关驱动。

## 2026-05-11 YX75R Channel2 Diagnostic Firmware

- 用户同意尝试 channel2 对照。
- 已编译临时诊断固件：
  - `RS485_ALARM_CHANNEL=RS485_CHANNEL_2`
  - marker: `fw-yx75r-channel2-diag-20260511`
  - YX75R 地址仍为 `01`
  - 波特率仍为 `9600`
  - 不启用 `0xFF` fallback
  - 不扫描备用通道
- 镜像：
  - `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`
  - 时间戳：`2026-05-11 10:44:21`
  - 大小：`2097152` bytes
- 注意：
  - 该版本是临时硬件诊断固件，不是生产配置。
  - 测试前需要把 YX75R 接到 J7/channel2，并断开 channel2 上的土壤/倾角传感器。

## 2026-05-11 YX75R Channel2 Diagnostic Retest

- channel2 诊断固件复测命令：
  - `buzzer_on`: `cd4d5b4e-bb7b-4f85-a73e-063757d2c071`
  - `buzzer_off`: `d7237b5a-168b-4e28-ad92-fbc36c9e878b`
- ACK 结果：
  - `ch=1`，确认走 J7/channel2/U8。
  - `used_fb=false`，确认无 `0xFF` fallback。
  - `buzzer_on` result: `s=2,reg=300F,val=0101,baud=9600,ph=00C1004080804080,final=-5`
  - `buzzer_off` result: `s=2,reg=0016,val=0001,baud=9600,ph=00C1004080804080,final=-5`
- 结论：
  - channel2 也没有拿到 YX75R 合法 echo。
  - 若现场无动作，基本排除 channel1 单路故障，问题转向当前 SC16IS752 + 自动方向 RS485 模块方案与 YX75R 电气兼容/驱动能力。

## 2026-05-11 Restore Sensor Channel Layout

- 用户决定停止继续在 RK2206 当前 RS485 自动方向链路上测试 YX75R，并要求恢复传感器通道：
  - 土壤温湿度切回 ch1。
  - 倾角保持 ch2。
- 已修改并编译固件：
  - `RS485_SOIL_CHANNEL=RS485_CHANNEL_1`
  - `RS485_TILT_CHANNEL=RS485_CHANNEL_2`
  - `ENABLE_RS485_ALARM=0`
  - marker: `fw-rs485-soil-ch1-tilt-ch2-20260511`
- 镜像：
  - `F:\2\openharmony\txsmartropenharmony\out\rk2206\isoftstone-rk2206\images\Firmware.img`
  - 时间戳：`2026-05-11 10:51:57`
  - 大小：`2097152` bytes
- 说明：
  - RK2206 侧 YX75R 报警临时禁用，避免 9600 报警命令污染 4800 传感器通道。
  - 声光报警后续建议短期挂 RK3568 侧 USB-RS485/工业串口网关，长期改 DE/RE 可控 RS485。
