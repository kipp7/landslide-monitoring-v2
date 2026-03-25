# 硬件稳定版逐文件适配清单

## 状态

- 主题：`hardware-stable-version-file-adaptation-checklist`
- 适配目标：
  - 让 `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0`
    全面向当前软件主线契约靠拢
- 当前前提：
  - 软件联调主线已基本完成到第 3 阶段
  - 本机当前无 `hb / gn / ninja`，不能直接对 OpenHarmony 工程做正式构建验证
  - 已有软件侧协议仿真证明旧式扁平 JSON 可以映射到 `TelemetryEnvelope v1`

## 1. 当前推荐适配策略

### 优先策略

优先让**硬件节点直接向平台标准契约靠拢**，而不是长期保留旧式扁平 JSON 再靠网关做厚重业务映射。

目标统一成：

- 身份：`device_id + device_secret`
- 遥测：`TelemetryEnvelope v1`
- 命令接收：`DeviceCommand v1`
- 命令回执：`DeviceCommandAck v1`

### 临时过渡策略

如果短期内板端资源或工程改造成本过高，可允许网关临时做：

- legacy JSON -> `TelemetryEnvelope v1`
- 链路 ACK/OK -> 标准 `cmd_ack/{device_id}` payload

但这只能作为过渡，不应成为长期真相。

## 2. 节点固件必须修改的文件

### 2.1 `config/app_config.h`

路径：

- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\config\app_config.h`

当前问题：

- 仍使用 `NODE_ID`
- 没有 `device_id / device_secret / cred_version / schema_version` 身份配置
- GPS / I2C 当前真值虽然有一版修正，但仍需和其他 GPS 代码/文档统一

必须修改：

1. 增加设备身份配置结构
   - `DEVICE_ID`
   - `DEVICE_SECRET`
   - `IDENTITY_SCHEMA_VERSION`
   - `CRED_VERSION`

2. 将 `NODE_ID` 降级为可选调试标签或彻底移除

3. 明确最终 GPS UART 真值
   - 统一到一个 UART 口
   - 文档与代码一致

4. 保留 `UPLOAD_INTERVAL_MS / ACK_TIMEOUT_MS / MAX_RETRY_COUNT`
   但重新定义其语义：
   - 链路级确认参数
   - 不是平台命令回执参数

优先级：

- `P0`

### 2.2 `app/sensor_data.h`

路径：

- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\app\sensor_data.h`

当前问题：

- 当前数据结构完全围绕旧扁平 JSON
- 缺少 `TelemetryEnvelope v1` 对应的 `metrics/meta` 视角

必须修改：

1. 保留底层采样结构没问题
2. 但需要新增一个“上传投影”概念，至少在设计上明确：
   - 哪些字段进 `metrics`
   - 哪些字段进 `meta`

建议映射：

- `temperature` -> `temperature_c`
- `humidity` -> `humidity_pct`
- `latitude` -> `gps_latitude`
- `longitude` -> `gps_longitude`
- `accel_x/y/z` -> `accel_x_g / accel_y_g / accel_z_g`
- `gyro_x/y/z` -> `gyro_x_dps / gyro_y_dps / gyro_z_dps`
- `angle_x/y` -> `tilt_x_deg / tilt_y_deg`
- `battery_level` -> `battery_pct`
- `warning` -> `warning_flag`

进 `meta` 的建议：

- `uptime`
- 传感器有效位：`temp_ok / imu_ok / gps_ok`
- 固件版本
- 采样参数

优先级：

- `P0`

### 2.3 `main/landslide_main.c`

路径：

- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\main\landslide_main.c`

当前问题：

- 当前发送的是旧式扁平 JSON：
  - `node`
  - `temp`
  - `humi`
  - `lat`
  - `lon`
  - `bat`
  - `warn`
- 当前没有 `schema_version`
- 当前没有 `device_id`
- 当前没有 `metrics/meta`

必须修改：

1. 重写 `DataUploadTask()` 的 JSON 构建逻辑

目标改成：

```json
{
  "schema_version": 1,
  "device_id": "<uuid>",
  "event_ts": "...",
  "seq": 123,
  "metrics": { ... },
  "meta": { ... }
}
```

2. 日志输出同步调整
   - 不再以 `Node ID` 作为主身份
   - 改成 `device_id`

3. 上传包长度重新评估
   - 适配 `TelemetryEnvelope v1`
   - 确保不会把 XL01 链路预算直接打爆

4. 如果暂时无法板端直接输出标准 envelope
   - 这里至少要明确保留一个独立的“legacy payload builder”
   - 并和“target envelope builder”分开，不要混写

优先级：

- `P0`

### 2.4 `drivers/xl01/xl01_driver.c`

路径：

- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\drivers\xl01\xl01_driver.c`

当前问题：

- 当前 ACK 语义还是字符串：
  - `ACK`
  - `OK`
- 这是链路确认，不是平台命令回执

必须修改：

1. 保留链路级 ACK/OK 作为节点 ↔ 网关确认
2. 但代码和文档里必须明确：
   - 这不是平台 `cmd_ack/{device_id}` 的最终回执格式

建议修改：

- 增加注释和命名区分：
  - `link ack`
  - `platform command ack`

- 如板端要直接参与平台命令回执：
  - 则新增标准回执 payload 构建函数
  - 生成：
    - `schema_version`
    - `command_id`
    - `device_id`
    - `ack_ts`
    - `status`
    - `result`

优先级：

- `P0`

### 2.5 `drivers/xl01/xl01_driver.h`

路径：

- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\drivers\xl01\xl01_driver.h`

当前问题：

- 接口只表达“透明串口发收”
- 没有区分：
  - 普通 telemetry uplink
  - 命令回执 uplink

建议修改：

- 若继续用网关做平台化转换：
  - 保持现有接口即可
- 若板端直接向平台主线靠：
  - 增加更明确的发送接口抽象
    - `SendTelemetryEnvelope`
    - `SendCommandAck`

优先级：

- `P1`

### 2.6 `drivers/sensors/gps_driver.c`

路径：

- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\drivers\sensors\gps_driver.c`

当前问题：

- 注释中仍写：
  - `EUART0_M0`
- 与其他文档中的 `EUART1_M1` / `EUART0_M1` 建议存在冲突

必须修改：

1. 统一 GPS UART 真值
2. 确保日志输出中的 UART 名称与真实配置一致
3. 保证和 `app_config.h` 中最终定义完全一致，不再双来源

优先级：

- `P0`

### 2.7 `drivers/sensors/gps_driver.h`

路径：

- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\drivers\sensors\gps_driver.h`

当前问题：

- 需要确认是否引用统一的配置宏，而不是再自定义一套 GPS UART 真值

建议修改：

- 统一从 `config/app_config.h` 取最终配置
- 避免驱动层再次藏一套 UART 定义

优先级：

- `P0`

### 2.8 `drivers/sensors/gps_module.h` / `gps_module.c`

路径：

- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\drivers\sensors\gps_module.h`
- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\drivers\sensors\gps_module.c`

当前问题：

- 仍保留另一套 GPS 实现
- 且写死 `EUART0_M0 / PB6/PB7`
- 与现有 `gps_driver.c` 平行存在，容易造成真值冲突

当前处理决策：

- `gps_driver.*` 作为唯一保留实现
- `gps_module.*` 明确标记为 deprecated / historical reference
- `BUILD.gn` 继续只保留 `gps_driver.c`

后续不再允许：

- 把 `gps_module.*` 当成当前 GPS 真值来源
- 让两套 GPS 实现并行演化

优先级：

- `P0`

### 2.9 `BUILD.gn`

路径：

- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\BUILD.gn`

当前问题：

- 当前仅编：
  - `gps_driver.c`
  - 不编 `gps_module.c`
- 但仓内仍同时存在另一套 GPS 模块，会误导维护

建议修改：

1. 保持只保留一套 GPS 真实现
2. 若增加新的 identity / envelope / command ack 模块：
   - 这里必须同步纳入 `sources`

建议新增模块（若按板端直接贴平台契约方案）：

- `app/device_identity.c/.h`
- `app/telemetry_envelope_builder.c/.h`
- `app/command_ack_builder.c/.h`

优先级：

- `P1`

## 3. 文档必须同步的文件

### 3.1 `README_zh.md`

路径：

- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\README_zh.md`

必须修改：

- 把示例 JSON 改成平台当前目标格式，或明确写成 legacy 过渡格式
- 明确 `device_id + device_secret`
- 明确 MQTT topic：
  - `telemetry/{device_id}`
  - `cmd/{device_id}`
  - `cmd_ack/{device_id}`

优先级：

- `P0`

### 3.2 `当前配置总结.md`

路径：

- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\当前配置总结.md`

必须修改：

- 把 GPS / XL01 / I2C 当前真值统一成和代码一致
- 明确哪些项：
  - 已测试
  - 待测试
  - 已废弃

优先级：

- `P0`

### 3.3 `GPS最终方案.md` / `GPS引脚冲突解决方案.md` / `小凌派GPS引脚方案修正.md`

必须修改：

- 只保留一份当前真值
- 其他文档明确归档或标旧

优先级：

- `P0`

### 3.4 `接线检查清单.md`

必须修改：

- 和最终 GPS UART 真值完全一致
- 把“板级接线”与“平台协议适配”边界分开说明

优先级：

- `P1`

## 4. 网关侧必须补的内容

如果短期内不直接改板端输出成 `TelemetryEnvelope v1`，则网关侧至少要有一层确定性转换器，负责：

1. `node -> device_id`
2. `temp/humi/lat/lon/bat/warn -> canonical metrics key`
3. 扁平 JSON -> `metrics/meta`
4. 链路 ACK/OK 与平台命令回执分层

建议新增：

- 一个“legacy-node-to-telemetry-envelope”适配器
- 一个“legacy-link-ack-to-platform-command-ack”适配器

注意：

- 这是过渡层，不应成为长期真相

## 5. 第 4 阶段真机 smoke 最小验收项

在开始真实硬件替换前，必须准备以下验收清单：

### 5.1 遥测上行

- 真实节点上电
- 经 XL01 / 网关发出 telemetry
- 平台看到：
  - MQTT ingress
  - Kafka raw
  - ClickHouse
  - PostgreSQL `device_state`

### 5.2 命令下行

- 平台下发 `set_config`
- 真机或网关收到命令
- 真机或网关回执
- 平台看到：
  - `device_commands` 状态变化
  - `device_command_events`

### 5.3 命令通知

- 至少验证 1 条：
  - `COMMAND_FAILED`
  - `COMMAND_ACKED`
  在当前策略下是否按预期产生命令通知

### 5.4 设备身份

- `device_id`
- `device_secret`
- MQTT username/password

三者一致，且 ACL 不越权

## 6. 当前推荐执行顺序

### P0 先做

1. 冻结 GPS / UART 真值
2. 冻结身份模型：`device_id + device_secret`
3. 冻结遥测契约：直接 envelope 或网关转换
4. 清理双 GPS 实现与双真值文档

### P1 再做

5. 重写/补充 telemetry builder
6. 重写/补充 command ack builder
7. 更新 `BUILD.gn`
8. 更新接线与 README

### P2 最后做

9. 1 台真机 smoke
10. 2-3 台小规模联调

## 7. 当前最重要的一句话

当前最需要避免的是：

- 拿“硬件稳定版能发 JSON”误判成“它已经完成对当前平台主线的适配”

当前正确做法是：

- 先把这份固件改成“向软件主线靠”
- 再进入真机 smoke
