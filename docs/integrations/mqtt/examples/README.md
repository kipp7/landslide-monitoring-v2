# MQTT 示例（与 JSON Schema 对齐）

本目录存放 MQTT 消息的**机器可验证**示例，用于：

- 让设备端/服务端在实现前就能对齐字段与命名
- 作为契约校验脚本的输入（见 `docs/tools/validate-contracts.py`）

示例文件：

- `telemetry-envelope.v1.json`（遥测上报）
- `presence-event.v1.json`（在线/离线事件）
- `device-command.v1.json`（服务端下发命令）
- `device-command-ack.v1.json`（设备回执）
- `firmware-simulator.md`（可运行的固件模拟器：上报/命令/回执 + schema 校验 + 重连退避 + state 持久化）
