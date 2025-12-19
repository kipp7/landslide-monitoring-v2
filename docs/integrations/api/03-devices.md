# 设备管理接口（v2：UUID + 设备身份包）

核心变化：
- `deviceId` 使用 UUID 字符串（与设备端一致，烧录写入）
- 设备鉴权采用 `deviceId + deviceSecret`（服务端只存 hash）
- 设备上报指标不写死：通过 `sensors` 字典表与 `sensorKey` 体系扩展

## 1. 获取设备列表

**GET** `/devices`

权限：`device:view`

查询参数：
- `page`, `pageSize`
- `keyword`（设备名称）
- `status`（inactive/active/revoked）
- `stationId`
- `deviceType`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
        "deviceName": "龙门滑坡监测点设备",
        "deviceType": "multi_sensor",
        "status": "active",
        "stationId": "7b0f2d41-0b25-4d16-9a38-7283a4dcdb4e",
        "lastSeenAt": "2025-12-15T10:00:00Z"
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 2. 获取设备详情

**GET** `/devices/{deviceId}`

权限：`device:view`

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "deviceName": "龙门滑坡监测点设备",
    "deviceType": "multi_sensor",
    "status": "active",
    "stationId": "7b0f2d41-0b25-4d16-9a38-7283a4dcdb4e",
    "metadata": { },
    "lastSeenAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 3. 创建设备（生成身份包，用于烧录）

**POST** `/devices`

权限：`device:create`

请求：
```json
{
  "deviceName": "龙门滑坡监测点设备",
  "deviceType": "multi_sensor",
  "stationId": "7b0f2d41-0b25-4d16-9a38-7283a4dcdb4e",
  "metadata": { "install": { "lat": 21.6847, "lng": 108.3516 } }
}
```

响应（注意：`deviceSecret` 只返回一次）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "deviceSecret": "base64-or-hex-secret",
    "schemaVersion": 1,
    "credVersion": 1
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

建议：后端同时提供“下载烧录配置文件/二维码内容”的能力（实现阶段）。

## 4. 更新设备

**PUT** `/devices/{deviceId}`

权限：`device:update`

请求（示例）：
```json
{
  "deviceName": "新名称",
  "stationId": "7b0f2d41-0b25-4d16-9a38-7283a4dcdb4e",
  "metadata": { "note": "更换安装位置" }
}
```

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "updatedAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 5. 吊销/禁用设备（立即拒绝 MQTT 上报）

**PUT** `/devices/{deviceId}/revoke`

权限：`device:update`

请求（可选）：
```json
{
  "reason": "设备丢失或被盗"
}
```

说明：
- 将 `devices.status` 置为 `revoked`
- EMQX 鉴权时拒绝该设备连接/发布

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "status": "revoked",
    "revokedAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 6. 获取传感器字典（全局）

**GET** `/sensors`

权限：`device:view`

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      { "sensorKey": "displacement_mm", "unit": "mm", "dataType": "float", "displayName": "位移" }
    ]
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 7. 配置设备应有传感器（可选）

**PUT** `/devices/{deviceId}/sensors`

权限：`device:update`

请求（示例）：
```json
{
  "sensors": [
    { "sensorKey": "displacement_mm", "status": "enabled" },
    { "sensorKey": "tilt_x_deg", "status": "enabled" }
  ]
}
```

说明：
- 该接口用于“声明设备理论上支持哪些传感器”，便于前端展示与缺失提示
- 实际上报仍然允许稀疏字段，不强制每次包含全部 key

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "sensors": [
      { "sensorKey": "displacement_mm", "status": "enabled" },
      { "sensorKey": "tilt_x_deg", "status": "enabled" }
    ],
    "updatedAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 8. 下发设备命令（控制/配置）

**POST** `/devices/{deviceId}/commands`

权限：`device:control`

请求（示例）：
```json
{
  "commandType": "set_config",
  "payload": {
    "sampling_s": 5,
    "report_interval_s": 5
  }
}
```

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "commandId": "1b4c81aa-3c5f-4c14-8f9e-1c0fbe9d2c3d",
    "status": "queued"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 9. 获取设备命令列表（用于运维排查）

**GET** `/devices/{deviceId}/commands`

权限：`device:control`

查询参数：
- `page`, `pageSize`
- `status`（queued/sent/acked/failed/timeout/canceled）

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "commandId": "1b4c81aa-3c5f-4c14-8f9e-1c0fbe9d2c3d",
        "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
        "commandType": "set_config",
        "payload": { "sampling_s": 5 },
        "status": "acked",
        "sentAt": "2025-12-15T10:00:01Z",
        "ackedAt": "2025-12-15T10:00:02Z",
        "result": { },
        "errorMessage": "",
        "createdAt": "2025-12-15T10:00:00Z",
        "updatedAt": "2025-12-15T10:00:02Z"
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 10. 获取设备命令详情（用于运维排查）

**GET** `/devices/{deviceId}/commands/{commandId}`

权限：`device:control`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "commandId": "1b4c81aa-3c5f-4c14-8f9e-1c0fbe9d2c3d",
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "commandType": "set_config",
    "payload": { "sampling_s": 5 },
    "status": "acked",
    "sentAt": "2025-12-15T10:00:01Z",
    "ackedAt": "2025-12-15T10:00:02Z",
    "result": { },
    "errorMessage": "",
    "createdAt": "2025-12-15T10:00:00Z",
    "updatedAt": "2025-12-15T10:00:02Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```
