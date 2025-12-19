# 命名与约定（v2，全局规范）

目的：减少“硬编码/歧义/命名混乱”，让后端、数据库、MQTT/Kafka、前端在同一套语言体系下协作。

## 1. ID 与时间

- 所有业务 ID 一律使用 UUID 字符串：
  - `deviceId`、`stationId`、`userId`、`ruleId`、`alertId`、`eventId`、`commandId`
- 时间统一 RFC3339 UTC：
  - 例：`2025-12-15T10:00:00Z`
  - 带毫秒：`2025-12-15T10:00:00.123Z`
- 双时间戳（两套命名，按通道区分）：
  - API（JSON，camelCase）：
    - `eventTs`：设备产生时间（可能不可信）
    - `receivedTs`：服务端接收时间（默认用于窗口计算）
  - MQTT/Kafka（消息 JSON，snake_case）：
    - `event_ts`：设备产生时间（可能不可信）
    - `received_ts`：服务端接收时间（默认用于窗口计算）

## 2. 传感器/指标命名（sensorKey）

### 基本规则

- 一律 `snake_case`（小写 + 下划线），禁止中文 key
- 尽量在 key 或字典表中明确单位（推荐在 key 中带单位后缀）
- 同义词必须统一：例如“位移”用 `displacement_mm`，不要同时存在 `move_mm`、`shift_mm`

### 推荐示例

- 位移：`displacement_mm`
- 位移速率：`displacement_velocity_mm_h`
- 倾角：`tilt_x_deg`、`tilt_y_deg`
- 雨量：`rainfall_mm`、雨强：`rainfall_intensity_mm_h`
- 含水率：`soil_moisture_pct`
- 电池：`battery_v`、`battery_pct`
- 信号：`rssi_dbm`、`snr_db`、`packet_loss_pct`

### 非数值状态

控制/状态类 key 可以存在（如 `relay_state`），但建议：
- 高频上报不要大量字符串；字符串状态优先走 `device_state` 或命令回执
- 状态值尽量枚举化（如 `ON/OFF`），避免任意字符串

## 3. MQTT Topic 命名

- 全小写，分段使用 `/`
- 设备只能发布自己的 topic（由 ACL 约束）

推荐：
- 上报：`telemetry/{device_id}`
- 命令：`cmd/{device_id}`
- 命令回执：`cmd_ack/{device_id}`

## 4. Kafka Topic 命名

- 全小写 + 点分隔 + 版本后缀
- 必须包含版本：`*.v1`

推荐：
- `telemetry.raw.v1`
- `telemetry.dlq.v1`
- `alerts.events.v1`
- `device.commands.v1`
- `device.command_acks.v1`

## 5. 数据库命名

### PostgreSQL

- 表：`snake_case`，复数优先（如 `users`、`devices`、`stations`）
- 主键：`*_id`（UUID）
- 时间：`*_at`（TIMESTAMPTZ）
- JSON：`*_json` 或 `metadata`（JSONB）
- 布尔：`is_*`、`has_*`（如 `is_active`）

### ClickHouse

- 表：`telemetry_raw`、`telemetry_agg_1m` 等
- 时间：`received_ts` 作为主时间轴

## 6. API 命名与结构

- 资源路径使用复数：`/devices`、`/stations`、`/alert-rules`
- 版本前缀：`/api/v1`
- 错误结构统一包含 `traceId`
- 分页统一：`page/pageSize`

## 6.1 消息（MQTT/Kafka）命名

为降低设备端实现成本与与常见物联网实践一致，消息体字段建议采用 `snake_case`（例如 `device_id`、`schema_version`）。

注意：

- **传感器 key（`sensorKey`）永远使用 `snake_case`**，无论 API 还是消息体。
- API 返回给前端时按 camelCase 命名（例如 `deviceId`），但不要改变 `sensorKey` 的命名风格（避免前后端出现两套 key）。

## 7. 枚举值约定（避免前后端不一致）

- severity：`low|medium|high|critical`
- 设备状态：`inactive|active|revoked`
- 告警状态（聚合结果）：`active|acked|resolved`
