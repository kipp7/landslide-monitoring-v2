# PRD：设备命令下发与回执（控制/配置）

## 1. 背景

设备控制与参数下发需要可靠闭环：请求、下发、回执、超时、审计；且不能与遥测写入耦合。

## 2. 目标

- 支持下发命令并记录状态（queued/sent/acked/failed/timeout）。
- 支持设备回执与审计追踪。
- 允许非数值配置（JSON payload）。

## 3. 功能需求

- API：创建命令、查询命令状态（实现阶段可扩展）。
- MQTT：cmd/{deviceId} 下发，cmd_ack/{deviceId} 回执。
- DB：device_commands 表存请求与回执结果。

## 4. 验收标准

- 创建命令返回 commandId，状态初始为 queued。
- 设备回执后状态变为 acked，并可查到 result。

## 5. 依赖

- API：`docs/integrations/api/03-devices.md`
- MQTT：`docs/integrations/mqtt/mqtt-topics-and-envelope.md`
- DB：`docs/integrations/storage/postgres/tables/13-device-commands.sql`

