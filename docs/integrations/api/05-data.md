# 数据接口（v2：ClickHouse 遥测，稀疏指标）

原则：
- 历史/曲线数据来自 ClickHouse（`telemetry_raw` / 聚合表）
- 实时“最新值”优先来自 PostgreSQL `device_state`（影子），避免每次都扫 ClickHouse
- 指标不写死：通过 `sensorKey` 查询；设备没有的传感器允许缺失

## 1. 获取设备最新状态（影子）

**GET** `/data/state/{deviceId}`

权限：`data:view`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "updatedAt": "2025-12-15T10:00:00Z",
    "state": {
      "metrics": {
        "displacement_mm": 1.23,
        "tilt_x_deg": 0.18,
        "battery_v": 3.92
      },
      "meta": {
        "fw": "1.0.0",
        "sampling_s": 5
      }
    }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 2. 获取设备历史曲线（按指标返回 series）

**GET** `/data/series/{deviceId}`

权限：`data:view`

查询参数：
- `startTime`（必填）RFC3339 UTC
- `endTime`（必填）RFC3339 UTC
- `sensorKeys`（必填）逗号分隔，例如 `displacement_mm,tilt_x_deg`
- `interval`（可选）`raw|1m|5m|1h|1d`（默认 `raw`）
- `timeField`（可选）`received|event`（默认 `received`）

响应（每个指标一条曲线）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "startTime": "2025-12-15T00:00:00Z",
    "endTime": "2025-12-15T01:00:00Z",
    "interval": "1m",
    "series": [
      {
        "sensorKey": "displacement_mm",
        "unit": "mm",
        "dataType": "float",
        "points": [
          { "ts": "2025-12-15T00:00:00Z", "value": 1.23 },
          { "ts": "2025-12-15T00:01:00Z", "value": 1.26 }
        ]
      }
    ],
    "missing": [
      { "sensorKey": "tilt_x_deg", "reason": "no_data_in_range" }
    ]
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 3. 获取原始点列表（调试/导出用）

**GET** `/data/raw/{deviceId}`

权限：`data:view`

查询参数：
- `startTime`（必填）
- `endTime`（必填）
- `sensorKey`（必填，单个）
- `limit`（可选，默认 10000，最大值由系统配置限制）
- `order`（可选）`asc|desc`（默认 `asc`）

响应（每个点包含 receivedTs/eventTs，便于排查乱序）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "sensorKey": "displacement_mm",
    "list": [
      {
        "receivedTs": "2025-12-15T00:00:00.123Z",
        "eventTs": "2025-12-15T00:00:00.000Z",
        "seq": 12345,
        "value": 1.23,
        "quality": 1
      }
    ]
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 4. 获取统计/聚合数据（站点或设备维度）

**GET** `/data/statistics`

权限：`data:analysis`

查询参数：
- `scope`（必填）`device|station`
- `deviceId`（scope=device 时必填）
- `stationId`（scope=station 时必填）
- `sensorKey`（必填）
- `startTime`（必填）
- `endTime`（必填）
- `interval`（可选）`1h|1d`（默认 `1h`）

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "scope": "device",
    "sensorKey": "displacement_mm",
    "interval": "1h",
    "buckets": [
      { "ts": "2025-12-15T00:00:00Z", "min": 1.2, "max": 1.6, "avg": 1.4, "count": 3600 }
    ]
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 5. 导出数据

**POST** `/data/export`

权限：`data:export`

请求：
```json
{
  "scope": "device",
  "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
  "startTime": "2025-12-01T00:00:00Z",
  "endTime": "2025-12-15T23:59:59Z",
  "sensorKeys": ["displacement_mm", "tilt_x_deg"],
  "format": "csv"
}
```

## 6. 查询 Telemetry DLQ（用于运维排查）

说明：DLQ 消息会由 `telemetry-dlq-recorder` 落库到 PostgreSQL，API 提供分页查询与详情查看，便于定位 ingest/writer 的坏消息来源。

### 6.1 列表查询

**GET** `/telemetry/dlq`

权限：`data:analysis`（当前实现为 admin token 保护，见 `ADMIN_API_TOKEN`）

查询参数：
- `page`, `pageSize`
- `reasonCode`（可选，例如 `invalid_json` / `schema_validation_failed` / `payload_too_large` / `metrics_too_many`）
- `deviceId`（可选，UUID；DLQ 中可能为空）
- `startTime`, `endTime`（可选，RFC3339；必须同时提供，用于按时间窗口过滤）

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "messageId": "c67be5a5-2d97-4e06-8d1f-3e6f1e2f9d9f",
        "receivedAt": "2025-12-19T08:00:00Z",
        "deviceId": "",
        "reasonCode": "invalid_json",
        "reasonDetail": "Unexpected token ...",
        "rawPayloadPreview": "{ ...",
        "kafka": { "topic": "telemetry.dlq.v1", "partition": 0, "offset": "123", "key": "" },
        "createdAt": "2025-12-19T08:00:01Z"
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
  },
  "timestamp": "2025-12-19T08:00:02Z",
  "traceId": "req_01J..."
}
```

### 6.2 详情查询

**GET** `/telemetry/dlq/{messageId}`

权限：`data:analysis`（当前实现为 admin token 保护，见 `ADMIN_API_TOKEN`）

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "messageId": "c67be5a5-2d97-4e06-8d1f-3e6f1e2f9d9f",
    "receivedAt": "2025-12-19T08:00:00Z",
    "deviceId": "",
    "reasonCode": "invalid_json",
    "reasonDetail": "Unexpected token ...",
    "rawPayload": "{ ...",
    "kafka": { "topic": "telemetry.dlq.v1", "partition": 0, "offset": "123", "key": "" },
    "createdAt": "2025-12-19T08:00:01Z"
  },
  "timestamp": "2025-12-19T08:00:02Z",
  "traceId": "req_01J..."
}
```

### 6.3 统计查询（按 reasonCode 聚合）

**GET** `/telemetry/dlq/stats`

权限：`data:analysis`（当前实现为 admin token 保护，见 `ADMIN_API_TOKEN`）

查询参数：
- `startTime`, `endTime`（可选，RFC3339；必须同时提供，用于按时间窗口统计）
- `deviceId`（可选，UUID；用于定位单设备噪声/异常上报）

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "window": null,
    "deviceId": "",
    "totals": { "total": 12 },
    "byReasonCode": [
      { "reasonCode": "invalid_json", "count": 7 },
      { "reasonCode": "schema_validation_failed", "count": 5 }
    ]
  },
  "timestamp": "2025-12-19T08:00:02Z",
  "traceId": "req_01J..."
}
```

说明：
- 返回下载链接或任务 ID（数据量大建议异步导出）。

响应（异步导出）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "exportId": "b1b2c3d4-1111-2222-3333-444455556666",
    "status": "queued",
    "createdAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```
