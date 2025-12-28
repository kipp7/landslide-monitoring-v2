# 华为/硬件 legacy 端点兼容层（WS-K.6）

目标：让参考区遗留的 `/huawei/*` 与 `/iot/huawei` **不缺失**，同时把能力落到 v2 的“设备命令队列 + Telemetry 主链路”。

## 1) Telemetry：`/iot/huawei`

服务：`services/huawei-iot-adapter`

- v2：`POST /iot/huawei/telemetry`
- legacy 兼容：`POST /iot/huawei`（等价别名）

说明：
- 请求体仍按 v2 `huawei-iot-adapter` 的契约解析（`deviceId/device_id` 必须是 v2 设备 UUID）。
- 可选鉴权：`x-iot-token`（见 `services/huawei-iot-adapter/.env.example`）。

## 2) 命令/影子：`/huawei/*`

服务：`services/api`（Fastify）

这些端点在参考区实际已被禁用；v2 这里提供“可用的兼容层”，把旧调用映射为 v2 设备命令队列：

- `GET /huawei/config`（需要 `system:config`）
- `GET /huawei/command-templates`（需要 `device:control`）
- `GET /huawei/devices/:deviceId/shadow`（需要 `device:view`；返回 v2 `device_state`/ClickHouse 状态的简化映射）
- `POST /huawei/devices/:deviceId/commands`（需要 `device:control`）
- `POST /huawei/devices/:deviceId/led|motor|buzzer|reboot`（需要 `device:control`）

### 2.1 legacy deviceId → v2 UUID 映射

`/huawei/devices/:deviceId/*` 的 `deviceId` 在参考区通常不是 UUID。v2 兼容层通过 `devices.metadata` 做映射：

任意一个字段命中即可：
- `metadata.huawei_device_id`
- `metadata.huawei.deviceId`
- `metadata.externalIds.huawei`

若找不到映射，将返回 `404` 且 `disabled=true`（提示需要补齐 metadata）。

### 2.2 可用性与降级

该兼容层依赖：
- `services/api` 已配置 PostgreSQL（用于写入 `device_commands`）
- `services/api` 已配置 Kafka（用于发布 `device.commands.v1`）

缺少依赖时，会返回 `503` 且 `disabled=true`（行为与参考区“禁用端点”一致）。

说明：
- 为对齐参考区行为：在“禁用”状态下，上述 `/huawei/*` 端点会直接返回禁用 payload（不要求登录/权限）；只有当 `services/api` 的依赖齐备并启用后，才会执行 RBAC 权限检查。
