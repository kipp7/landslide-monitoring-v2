# MQTT Topic 规范与 TelemetryEnvelope

目标：上报“可扩展、不写死”，支持稀疏字段、断电重连、重复/乱序，并保证后端可幂等处理。

## 1. Topic 规范（建议）

- 遥测上报（设备 → 平台）
  - `telemetry/{device_id}`
- 心跳/在线（设备 → 平台，可选）
  - `presence/{device_id}`
- 命令下发（平台 → 设备）
  - `cmd/{device_id}`
- 命令回执（设备 → 平台）
  - `cmd_ack/{device_id}`

说明：

- `device_id` 必须与 MQTT username 一致，便于 ACL 限制“只能发自己”。
- 主题中不建议包含站点等业务字段，避免设备换绑导致 topic 规则变化。

## 2. TelemetryEnvelope（JSON，v1）

设备发布到 `telemetry/{device_id}` 的 payload 建议为：

- `schema_version`：整数（v1=1）
- `device_id`：字符串
- `event_ts`：RFC3339（可空；设备时间不可信）
- `seq`：整数（强烈建议；断电可续增更好）
- `metrics`：对象（key-value 稀疏字段）
- `meta`：对象（可选，固件版本/采样率/电量状态等）

机器可读（Schema）：

- `docs/integrations/mqtt/schemas/telemetry-envelope.v1.schema.json`

## 2.1 PresenceEvent（JSON，v1，可选）

设备发布到 `presence/{device_id}` 的 payload 建议为：

- `schema_version`：整数（v1=1）
- `device_id`：UUID 字符串
- `event_ts`：RFC3339 UTC
- `status`：`online|offline`
- `meta`：对象（可选）

机器可读（Schema）：

- `docs/integrations/mqtt/schemas/presence-event.v1.schema.json`

示例：

```json
{
  "schema_version": 1,
  "device_id": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
  "event_ts": "2025-12-15T10:00:00Z",
  "seq": 12345,
  "metrics": {
    "displacement_mm": 1.23,
    "tilt_x_deg": 0.18,
    "rainfall_mm": 0.0,
    "battery_v": 3.92,
    "relay_state": "ON"
  },
  "meta": {
    "fw": "1.0.0",
    "sampling_s": 5
  }
}
```

## 3. 指标命名（不写死但要规范）

- `snake_case`，并尽量带单位后缀或在字典表中声明单位：
  - `displacement_mm`
  - `tilt_x_deg`
  - `soil_moisture_pct`
  - `rainfall_mm`
  - `battery_v`
  - `rssi_dbm`
- 允许非数值字段（控制/状态），但建议放入 `meta` 或走“设备影子/命令回执”链路，避免高频写入大量字符串。

## 4. 稀疏字段与缺失策略

- 节点没有某传感器：该 key 不上报即可。
- 后端不应把“缺字段”视为错误；是否异常由规则引擎决定（可配置缺失策略）。

## 5. 重复/乱序处理建议

- 幂等优先使用 `device_id + seq`。
- `received_ts` 由服务端补充并用于窗口计算；`event_ts` 仅用于展示/对齐（可选）。
