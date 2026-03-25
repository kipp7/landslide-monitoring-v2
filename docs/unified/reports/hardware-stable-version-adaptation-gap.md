# 硬件稳定版适配当前平台主线差距评估

## 状态

- 主题：`hardware-stable-version-adaptation-gap`
- 评估日期：`2026-03-25`
- 评估对象：
  - `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0`
- 当前结论：
  - 软件联调主线已基本完成到“平台可见性 + 语义 proof”阶段
  - 硬件稳定版还没有完成对当前平台主线契约的正式适配
  - 当前更像“真机替换前的固件候选”，不是“已完成真机联调的最终固件”

## 1. 软件/硬件大路线当前进度

### 软件联调

当前主线已达到：

1. 节点样例/协议边界已稳定
2. 网关到平台的软件链路已稳定
3. 平台可见性与语义 proof 已稳定

依据：

- `docs/unified/reports/field-rehearsal-phase-summary-latest.md`
- `docs/unified/reports/field-http-full-path-latest.json`
- `docs/unified/reports/field-semantic-scorecard-latest.md`

### 硬件真机联调

当前尚未达到：

4. 真实 RK2206 + XL01 + GPS 节点按当前平台主线契约完成替换并留证

也就是说，当前总体进度是：

- 软件联调：到第 3 阶段，基本完成
- 硬件真机联调：第 4 阶段，未完成

## 2. 当前硬件稳定版可否本机编译/仿真

### 2.1 构建方式

当前硬件稳定版是 OpenHarmony RK2206 工程，构建入口是：

- `BUILD.gn`
- 文档中的构建命令：`hb build -f`

关键文件：

- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\BUILD.gn`
- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\README_zh.md`

### 2.2 当前机器可编译性

本次检查结果：

- 当前机器未发现可直接调用的：
  - `hb`
  - `gn`
  - `ninja`
- 因此当前不能在本机直接完成这份固件的 OpenHarmony 正式编译

### 2.3 当前机器可否软件仿真

结论：

- 不能做“PC 侧完整固件仿真”
- 只能确认固件内部提供了“虚拟传感器数据模式”

原因：

- 当前工程不是标准 PC native 模拟工程
- 没有看到独立 host-run 仿真入口或本机 mock runner
- 当前所谓“虚拟”主要来自固件内：
  - `ENABLE_VIRTUAL`
  - 在板上运行时生成虚拟数据

这意味着：

- 现在能做的是“静态适配审计”
- 不能做“本机把这份固件完整跑起来”

### 2.4 当前已补的软件侧协议仿真

虽然当前不能把 OpenHarmony 固件本体直接在本机跑起来，但已经补了一条软件侧协议仿真：

- 脚本：
  - `scripts/dev/simulate-hardware-stable-version-adaptation.js`
  - `scripts/dev/check-hardware-stable-version-adaptation-sim.ps1`
- 报告：
  - `docs/unified/reports/hardware-stable-version-adaptation-sim-latest.json`

当前仿真做的事情是：

1. 模拟当前硬件稳定版主程序输出的旧式扁平 JSON
2. 把它映射成平台 `TelemetryEnvelope v1`
3. 用当前 schema 做校验

当前最新仿真结论已经是：

- `hardware-stable-version-legacy-payload-can-be-adapted-to-platform-telemetry-envelope-in-software`

这说明：

- 虽然当前固件还没直接贴平台主线
- 但从协议层看，这份旧 JSON 在软件侧是可以被确定性映射成当前平台遥测契约的

## 3. 当前硬件稳定版与平台主线的关键不对齐点

### 3.1 遥测身份模型不对齐

当前固件主程序发送的是：

- `node`

而当前平台主线要求：

- `device_id`
- 与 MQTT username 一致

关键差异：

- 当前固件还是节点字母标识（如 `A`）
- 当前平台主线已经统一以 `device_id + device_secret` 为身份真值

风险：

- 不改这一层，真机接入后无法直接落到当前 MQTT ACL / 平台设备身份体系

### 3.2 遥测包格式不对齐

当前固件输出是旧式扁平 JSON，例如：

- `node`
- `seq`
- `temp`
- `humi`
- `ax/ay/az`
- `tilt_x/tilt_y`
- `lat/lon`
- `bat`
- `warn`

而当前平台主线标准是 `TelemetryEnvelope v1`：

- `schema_version`
- `device_id`
- `event_ts`
- `seq`
- `metrics`
- `meta`

也就是说当前固件缺少：

- `schema_version`
- `device_id`
- `metrics` 包装
- `meta` 包装

### 3.3 指标命名与 canonical key 不完全对齐

当前固件使用：

- `temp`
- `humi`
- `lat`
- `lon`
- `bat`
- `warn`

而平台主线更偏向：

- `temperature_c`
- `humidity_pct`
- `gps_latitude`
- `gps_longitude`
- `battery_pct` / `battery_v`
- `warning_flag` 或其他更清晰的 canonical key

风险：

- 即使链路物理上通了，也还要在网关或适配层做旧字段映射
- 这与当前软件主线“节点尽量贴近平台 canonical key”的方向冲突

### 3.4 ACK 机制不对齐

当前 XL01 驱动使用的是：

- 应用层字符串 ACK
  - `"ACK"`
  - `"OK"`

这适用于节点 ↔ 中心节点串口/无线确认，但不等于平台命令回执契约。

当前平台命令回执主线是：

- topic：`cmd_ack/{device_id}`
- payload：带 `schema_version / command_id / device_id / status / ack_ts / result`

风险：

- 当前固件侧 ACK 只能证明“无线链路发送成功”
- 还不能直接作为平台命令回执真值

### 3.5 GPS 配置真值存在冲突

本次检查里看到了多份不一致真值：

- 文档有写 `EUART1_M1`
- 代码 `config/app_config.h` 当前写 `EUART0_M0`
- `gps_module.h` 也仍写 `EUART0_M0`

说明：

- GPS 引脚方案尚未完全冻结成单一当前真值

风险：

- 即使现在拿“硬件稳定版”上板，也存在 GPS 实际 wiring / UART 口与代码不一致的风险

### 3.6 平台主线目前仍以“软件优先联调”作为当前态

当前主线文档明确写的是：

- 先软件联调
- 最后再用真实节点替换模拟器

因此这份硬件稳定版当前应该被视为：

- 下一阶段真机联调输入

而不是：

- 已经并入当前软件主线契约的最终固件

## 4. 当前硬件稳定版里已经具备的正向基础

虽然还没完成平台适配，但这份固件并不是不能用。当前已具备这些正向基础：

- 模块化结构清晰
  - `config/`
  - `utils/`
  - `drivers/`
  - `app/`
  - `main/`
- XL01 驱动与 ACK 重试机制已实现
- GPS / MPU6050 / SHT30 的分层驱动已有
- 虚拟传感器模式已有
- 看门狗与多任务框架已有
- `seq` 概念已有

所以当前更准确的判断是：

- 固件工程质量尚可
- 但协议与身份模型还停留在旧真值

## 5. 第 4 阶段真机联调还差哪些明确验收项

在“真实 RK2206 + XL01 + GPS 真机替换”前，最少还差以下验收项：

### 5.1 固件输出契约对齐

必须明确并冻结：

1. 固件最终是直接输出 `TelemetryEnvelope v1`
2. 还是继续输出旧 JSON，由网关适配成 `TelemetryEnvelope v1`

推荐：

- 若节点资源允许，尽量贴近平台主链：
  - 使用 `device_id`
  - 使用 canonical metrics key
  - 使用 `metrics/meta` 结构

### 5.2 命令回执契约对齐

必须明确：

1. 节点侧“ACK/OK”是否只作为无线链路确认
2. 平台命令回执是否由网关重新封装成 `cmd_ack/{device_id}` 标准 payload

当前更合理的做法：

- 无线链路 ACK 保留在节点 ↔ 网关内部
- 平台命令回执仍统一转成 `cmd_ack/{device_id}` 标准消息

### 5.3 GPS UART 真值统一

必须先统一一份单一当前真值：

- 最终 UART 口
- 最终引脚
- 最终接线图
- 最终代码宏

并确保以下文件一致：

- `config/app_config.h`
- `drivers/sensors/gps_*.h/.c`
- 接线文档
- 当前配置总结

### 5.4 真实设备身份写入流程

必须明确：

- `device_id`
- `device_secret`
- `install_label`

各自怎么生成、怎么写入、怎么保存。

当前推荐：

- `device_id + device_secret` 写入设备
- `install_label` 只作为现场标签，不进高频遥测

### 5.5 真机 smoke 验收项

最小真机 smoke 应至少包含：

1. 真实节点上电
2. 真实节点通过 XL01 / 网关发出遥测
3. 平台端能看到：
   - Kafka/raw
   - ClickHouse
   - PostgreSQL `device_state`
4. 平台下发一条命令
5. 真机或网关回执
6. 平台看到：
   - `device_commands` 状态变化
   - `device_command_events`
   - 对应通知行为

## 6. 当前最推荐的下一步

当前最合理的不是直接“盲上真机”，而是按这个顺序：

1. 先冻结硬件稳定版与平台主线的适配策略
   - 直接贴平台 envelope
   - 或网关负责转换

2. 先统一 GPS / UART 当前真值

3. 先把固件输出字段和身份模型改到与平台主链一致

4. 再做 1 台真机 smoke

5. smoke 通过后，再扩到 2-3 台小规模联调

## 7. 本次检查结论

本次可以明确给出的结论是：

- 软件联调主线：已经基本完成
- 硬件稳定版：已具备作为真机替换输入的基础
- 但当前还没有完成“对当前平台主线契约的适配收口”
- 因此现在还不应把硬件联调状态记成“已完成”

更准确的状态应该写成：

- `software-path-ready`
- `hardware-firmware-candidate-ready`
- `real-hardware-contract-adaptation-pending`
