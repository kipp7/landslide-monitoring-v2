# 硬件稳定版源码对齐软件主线进展

## 状态

- 主题：`hardware-stable-version-source-alignment-progress`
- 更新日期：`2026-03-26`
- 当前目标：
  - 让 `硬件稳定版` 直接向软件主线契约靠拢

## 本轮已完成的源码级对齐

### 1. 身份模型

已修改：

- `E:\学校\02 项目\99 山体滑坡优化完善\硬件稳定版\xl01_landslide_monitor_v1.0\config\app_config.h`

当前新增：

- `IDENTITY_SCHEMA_VERSION`
- `CRED_VERSION`
- `DEVICE_ID`
- `DEVICE_SECRET`
- `INSTALL_LABEL`
- `LEGACY_NODE_LABEL`

说明：

- `NODE_ID` 不再作为平台主身份
- 当前方向已切到 `device_id + device_secret`

### 2. 遥测上报 builder

已新增：

- `app/device_identity.h`
- `app/device_identity.c`
- `app/telemetry_envelope_builder.h`
- `app/telemetry_envelope_builder.c`

说明：

- 当前固件不再只靠主循环里手写旧式扁平 JSON
- 已经具备独立的 `TelemetryEnvelope v1` 构建层

### 3. 命令回执 builder

已新增：

- `app/command_ack_builder.h`
- `app/command_ack_builder.c`

说明：

- 当前虽然还没把命令接收/回执主循环完全改完
- 但标准 `DeviceCommandAck v1` 的 builder 已经先落好

### 4. 主程序发送链

已修改：

- `main/landslide_main.c`

当前变化：

- 上传包改为走 `BuildTelemetryEnvelopeV1(...)`
- 日志输出也开始以 `device_id` 为主
- 不再直接依赖旧式扁平 JSON 拼接逻辑作为唯一上传实现

### 5. 构建入口

已修改：

- `BUILD.gn`

当前已把以下新文件纳入编译清单：

- `app/device_identity.c`
- `app/telemetry_envelope_builder.c`
- `app/command_ack_builder.c`

## 当前仍未完成的源码级适配

### 已继续推进：`xl01_driver` 边界分层

已修改：

- `drivers/xl01/xl01_driver.h`
- `drivers/xl01/xl01_driver.c`

当前变化：

- 原先唯一的 `ACK/OK` 语义，已明确降级为：
  - `link-level ACK`
- 新增了单独的：
  - `XL01_SendPlatformCommandAck(...)`
- 也新增了：
  - `XL01_HasLinkAck()`
  - `XL01_ClearLinkAck()`

这意味着：

- 现在 `xl01_driver` 层已经不再把链路 ACK 和平台命令回执混成一个概念
- 后续接 `DeviceCommandAck v1` 主流程时，有明确接口落点
- 当前 `xl01_driver` 接收侧也已开始具备最小 JSON 分片重组能力
- pretty JSON / 分片 JSON / `ACK + JSON` 混合到达场景，已经有软件侧留证

### 1. 命令接收主循环已开始切到标准 `DeviceCommand v1`

已新增：

- `app/device_command_parser.h`
- `app/device_command_parser.c`

已修改：

- `drivers/xl01/xl01_driver.h`
- `drivers/xl01/xl01_driver.c`
- `main/landslide_main.c`
- `BUILD.gn`

当前变化：

- `xl01_driver` 已可识别标准 `DeviceCommand v1` JSON
- `xl01_driver` 已可暂存并出队平台命令 payload
- `DataProcessTask()` 已开始处理平台命令
- 命令识别与解析已不再强依赖“无空格压缩 JSON”这一种格式
- 命令执行前已开始校验：
  - `cmd.device_id == local device_id`
- `set_config` 回执已开始返回：
  - `applied_keys`
  - `runtime_config`
- `set_sampling_interval` 已真正作用到运行时采样间隔
- `manual_collect` 已真正触发一次待执行的即时上报
- `deactivate_device` 已真正压下后续周期性 uplink
- `motor_*` / `buzzer_*` 已开始作用到运行态控制变量
- 当前最小支持命令：
  - `ping`
  - `set_config`
  - `reboot`
  - `restart_device`
  - `deactivate_device`
  - `set_sampling_interval`
  - `manual_collect`
  - `motor_start`
  - `motor_stop`
  - `buzzer_on`
  - `buzzer_off`
- 当前命令处理后会回：
  - `DeviceCommandAck v1`

同时已补软件侧命令路径仿真：

- `docs/unified/reports/hardware-stable-version-command-path-sim-latest.json`
- `docs/unified/reports/hardware-stable-version-command-guard-sim-latest.json`
- `docs/unified/reports/hardware-stable-version-command-fragment-sim-latest.json`
- `docs/unified/reports/hardware-stable-version-openharmony-command-harness-latest.json`

当前仿真结论：

- `hardware-stable-version-command-path-can-be-aligned-to-platform-command-contract-in-source`
- `hardware-stable-version-command-guards-can-be-aligned-to-platform-contract-in-source`
- `hardware-stable-version-xl01-receive-path-can-reassemble-command-json-fragments-in-source`
- `hardware-stable-version-openharmony-command-harness-confirms-source-level-command-path-behavior`

当前已额外证明：

- pretty JSON / 正常带空格命令体可被当前 parser 接受
- `device_id` 不匹配的命令会被忽略，且不会产生执行副作用
- `payload` 不是对象的非法命令会被忽略
- chunked pretty JSON 可被接收侧重组
- `ACK/OK` 与 chunked JSON 可在同一接收流中共存
- 未完成的半截 JSON 不会被误提升成可执行命令
- 已可通过 Emscripten harness 直接编译并运行：
  - `fifo.c`
  - `device_command_parser.c`
  - `device_identity.c`
  - `command_ack_builder.c`
  - `xl01_driver.c`
  这批真实 C 源码
- 当前 OpenHarmony harness 已切到直接消费：
  - `hardware-stable-version-gateway-command-samples-latest.json`
  - `docs/tools/field-rehearsal/payload-samples/hardware-stable-version/`
  不再依赖手写内嵌场景
- 当前最新源码级 harness 已直接验证：
  - `aligned_set_sampling_interval_pretty_json`
  - `ack_plus_aligned_set_config_pretty_json`
  - `mismatched_manual_collect_pretty_json`

当前新增发现：

- 当前源码级 harness 使用的本机 `DEVICE_ID` 仍是：
  - `00000000-0000-0000-0000-000000000001`
- 当前主线 MQTT 命令示例使用的是：
  - `2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c`
- 这意味着：
  - 当前 guard 逻辑本身是对的
  - 但硬件稳定版身份真值与主线命令样本真值还未统一
- 当前命令路径仿真报告已开始显式输出：
  - `platformExampleDeviceId`
  - `hardwareDeviceId`
  - `deviceIdMatches`
  - `hardwareAlignedCommandExample`
  后续做 gateway 注入时，可直接取当前硬件真值对齐后的命令样本
- 当前已新增一组可直接用于 gateway 注入的 pretty JSON 样本：
  - `docs/tools/field-rehearsal/payload-samples/hardware-stable-version/`
  - 并已输出：
    - `commandTopic`
    - `alignedSamples[]`
    - `mismatchSample`
    - `suggestedChunks80`

当前仍未真正完成：

- 真机环境下的正式构建与运行验证
- 让这批命令分支在真实板卡上完成端到端留证
- 统一硬件稳定版 `DEVICE_ID` 与主线平台命令样本的身份真值
- 为 `deactivate_device` 设计明确的重新启用路径
- 更可信的 `ack_ts` 时间来源

### 2. GPS 真值仍需继续统一到驱动双实现

当前已经进一步明确：

- `gps_driver.*`
  - 作为唯一保留实现
- `gps_module.*`
  - 降级为历史残留
  - 明确标旧
  - 不得再作为当前实现依据

当前已完成：

- 在 `gps_driver.h/.c` 中明确写明“这是当前 source of truth”
- 在 `gps_module.h/.c` 中明确写明“deprecated / not active implementation”

当前仍未完全完成：

- 若后续要彻底去掉双实现风险，还应考虑：
  - 从仓内进一步归档 `gps_module.*`
  - 或在具备正式构建验证后彻底删除

### 3. 当前没有正式构建验证

原因：

- 本机没有 `hb / gn / ninja`

因此当前结论是：

- 已完成源码级改造
- 但还没有完成 OpenHarmony 正式构建留证

## 当前判断

这轮不是文档层动作，而是已经开始真正把硬件稳定版源代码往软件主线契约上收。

当前阶段可记为：

- `source-alignment-started`

不是：

- `source-alignment-finished`

## 下一步建议

最自然的后续顺序：

1. 继续收 `xl01_driver.c/.h`
   - 明确链路 ACK 与平台命令回执分层
2. 继续收 `gps_driver.*` 与 `gps_module.*`
   - 统一成单一实现
3. 在具备工具链的机器上跑一次正式 `hb build -f`
