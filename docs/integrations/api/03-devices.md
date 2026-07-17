---
title: 03-devices
type: note
permalink: landslide-monitoring-v2-mainline/docs/integrations/api/03-devices
---

# 设备管理接口（v2：UUID + 设备身份包）

核心变化：
- `deviceId` 使用 UUID 字符串（与设备端一致，烧录写入）
- 设备鉴权采用 `deviceId + deviceSecret`（服务端只存 hash）
- 设备上报指标不写死：通过 `sensors` 字典表与 `sensorKey` 体系扩展
- 设备读路径允许额外暴露 canonical identity fields，用于现场正式命名分层：
  - `identityClass`
  - `deviceRole`
  - `regionCode`
  - `slopeCode`
  - `stationCode`
  - `nodeCode`
  - `gatewayCode`
  - `displayName`
  - `installLabel`
  - `legacyDeviceId`

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
        "stationCode": "ST-LS-CN-GX-YL-DC-001-01",
        "identityClass": "formal",
        "deviceRole": "field_node",
        "regionCode": "CN-GX-YL-DC",
        "slopeCode": "LS-CN-GX-YL-DC-001",
        "nodeCode": "ND-ST-LS-CN-GX-YL-DC-001-01-A",
        "gatewayCode": "GW-CN-GX-YL-DC-01",
        "displayName": "玉林东川滑坡体 01 点 A 节点",
        "installLabel": "FIELD-NODE-A",
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
    "stationCode": "ST-LS-CN-GX-YL-DC-001-01",
    "identityClass": "formal",
    "deviceRole": "field_node",
    "regionCode": "CN-GX-YL-DC",
    "slopeCode": "LS-CN-GX-YL-DC-001",
    "nodeCode": "ND-ST-LS-CN-GX-YL-DC-001-01-A",
    "gatewayCode": "GW-CN-GX-YL-DC-01",
    "displayName": "玉林东川滑坡体 01 点 A 节点",
    "installLabel": "FIELD-NODE-A",
    "metadata": { },
    "lastSeenAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

说明：
- 以上 canonical fields 允许为空，表示当前设备尚未完成正式现场命名落地
- `deviceName` 继续保留为兼容字段，不替代 `deviceId`
- `stationCode` / `nodeCode` / `gatewayCode` 属于业务身份层，不替代机器身份层

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

当前实际流程：
- 管理端先调用该接口生成身份包
- 将返回的 `deviceId + deviceSecret` 烧录到设备
- 设备首次使用 MQTT 成功鉴权后，后端会把 `devices.status` 从 `inactive` 自动切到 `active`
- 若设备被吊销为 `revoked`，后续 MQTT 鉴权与上报会被拒绝

补充说明：
- 对“RK3568 代管现场节点”这条主线，`POST /devices` 仍然是正式 registry 入口，但节点本身并不直接拿 `deviceSecret` 去连 MQTT。
- 这类节点的首次注册应理解为：
  - 先把固定 `deviceId` 建档到 `devices`
  - 再把同一组 `deviceId` 写进 RK3568 的 `SOUTHBOUND_NODES_JSON`
  - 随后由 RK3568 代节点统一与平台通信
- 当前推荐入口：
  - `scripts/dev/register-field-formal-devices.ps1`
  - `scripts/dev/set-rk3568-field-gateway-southbound-nodes.ps1`

建议：后端后续补充“下载烧录配置文件/二维码内容”的能力，但这不是当前主线接入的前置条件。

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

## 5.1 恢复已停用设备

**PUT** `/devices/{deviceId}/reactivate`

权限：`device:update`

请求（可选）：
```json
{
  "reason": "现场演练结束，恢复正式投运"
}
```

说明：
- 仅允许恢复当前 `status = revoked` 的设备
- 将 `devices.status` 恢复为停用前的原始运行状态（例如 `inactive` 或 `active`）
- 保留既有正式身份字段、站点绑定和投运元数据
- 写入 `reactivate_device` 审计记录，便于和 `revoke_device` 成对留痕

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "status": "inactive",
    "reactivatedAt": "2025-12-15T10:05:00Z"
  },
  "timestamp": "2025-12-15T10:05:00Z",
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

## 7. 设备传感器声明（可选）

### 7.1 获取设备传感器声明

**GET** `/devices/{deviceId}/sensors`

权限：`device:view`

说明：
- 返回“设备声明的传感器列表”，用于 Web/App 渲染、缺失提示与运维排查
- `status` 取值：
  - `enabled`：期望上报且应展示
  - `disabled`：存在但当前禁用（可展示为灰态）
  - `missing`：期望上报但当前缺失（可用于前端提示/告警）

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "list": [
      {
        "sensorKey": "displacement_mm",
        "status": "enabled",
        "displayName": "位移",
        "unit": "mm",
        "dataType": "float"
      }
    ]
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

### 7.2 配置设备传感器声明

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
- `status` 可选：`enabled | disabled | missing`

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
  "notifyOnAck": false,
  "successNotificationPolicy": "silent",
  "payload": {
    "sampling_s": 5,
    "report_interval_s": 5
  }
}
```

说明：
- `successNotificationPolicy` 可选：`inherit | silent | always_notify`
- `notifyOnAck` 继续保留为兼容字段：
  - `notifyOnAck=true` 等价于 `successNotificationPolicy=always_notify`
  - `notifyOnAck=false` 等价于 `successNotificationPolicy=silent`
- 当两个字段都不传时，本条命令使用 `successNotificationPolicy=inherit`，由后端继续按 `command-type default -> system default` 解析
- 当前 `command-type default` / `system default` 已接入正式 `system_configs`：
  - `command.success_notification.system_default`
  - `command.success_notification.command_type_defaults`
- 当最终有效策略为 `always_notify` 时，`COMMAND_ACKED` 会进入命令通知链路
- 当最终有效策略为 `silent` 时，`COMMAND_ACKED` 只更新命令状态与事件流，不生成命令通知

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "commandId": "1b4c81aa-3c5f-4c14-8f9e-1c0fbe9d2c3d",
    "status": "queued",
    "notifyOnAck": false,
    "successNotificationPolicy": "silent",
    "effectiveSuccessNotificationPolicy": "silent"
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
        "notifyOnAck": false,
        "successNotificationPolicy": "inherit",
        "effectiveSuccessNotificationPolicy": "silent",
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
    "notifyOnAck": false,
    "successNotificationPolicy": "inherit",
    "effectiveSuccessNotificationPolicy": "silent",
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

## 11. 获取设备命令事件流（用于通知/排查）

**GET** `/devices/{deviceId}/command-events`

权限：`device:control`

查询参数：
- `page`, `pageSize`
- `startTime`, `endTime`（可选，ISO8601；必须同时提供，用于按时间窗口筛选）
- `commandId`（可选，UUID）
- `eventType`（可选：COMMAND_SENT/COMMAND_ACKED/COMMAND_FAILED/COMMAND_TIMEOUT）

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "eventId": "b7a5c0a9-43a8-4a3d-9f7c-0b5b3c8ac1b2",
        "eventType": "COMMAND_TIMEOUT",
        "commandId": "1b4c81aa-3c5f-4c14-8f9e-1c0fbe9d2c3d",
        "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
        "status": "timeout",
        "detail": "ack timeout after 30s",
        "result": {},
        "createdAt": "2025-12-15T10:00:30Z",
        "ingestedAt": "2025-12-15T10:00:31Z"
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 12. 获取设备命令事件统计（用于筛选/聚合）

**GET** `/devices/{deviceId}/command-events/stats`

权限：`device:control`

查询参数：
- `startTime`, `endTime`（可选，ISO8601；必须同时提供，用于按时间窗口统计）
- `eventType`（可选：COMMAND_SENT/COMMAND_ACKED/COMMAND_FAILED/COMMAND_TIMEOUT）
- `bucket`（可选：1h/1d；需要同时提供 startTime+endTime，用于按时间桶聚合）

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "window": null,
    "eventType": "",
    "bucket": "",
    "totals": { "total": 1 },
    "byEventType": [{ "eventType": "COMMAND_TIMEOUT", "count": 1 }],
    "byBucket": []
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 13. 获取设备命令事件详情

**GET** `/devices/{deviceId}/command-events/{eventId}`

权限：`device:control`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "eventId": "b7a5c0a9-43a8-4a3d-9f7c-0b5b3c8ac1b2",
    "eventType": "COMMAND_TIMEOUT",
    "commandId": "1b4c81aa-3c5f-4c14-8f9e-1c0fbe9d2c3d",
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "status": "timeout",
    "detail": "ack timeout after 30s",
    "result": {},
    "createdAt": "2025-12-15T10:00:30Z",
    "ingestedAt": "2025-12-15T10:00:31Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 14. 获取设备命令通知列表（用于运维告警/通知展示）

**GET** `/devices/{deviceId}/command-notifications`

权限：`device:control`

查询参数：
- `page`, `pageSize`
- `startTime`, `endTime`（可选，ISO8601；必须同时提供，用于按时间窗口筛选）
- `commandId`（可选，UUID）
- `eventType`（可选：COMMAND_SENT/COMMAND_ACKED/COMMAND_FAILED/COMMAND_TIMEOUT）
- `status`（可选：pending/sent/delivered/failed）
- `notifyType`（可选：app/sms/email/wechat）
- `unreadOnly`（可选：true/false；只返回未读）

说明：
- 默认情况下，`COMMAND_ACKED` 不会出现在该列表
- 当某条命令的最终有效 success-notification policy 为 `always_notify` 时，`COMMAND_ACKED` 会生成命令通知并可在此查询
- 这可以来自：
  - 显式 `notifyOnAck=true`
  - 显式 `successNotificationPolicy=always_notify`
  - `successNotificationPolicy=inherit` 后命中 command-type default / system default

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "notificationId": "a4b3dfc4-55e6-4dd3-9f37-6c3c5a2e8b0c",
        "eventId": "b7a5c0a9-43a8-4a3d-9f7c-0b5b3c8ac1b2",
        "eventType": "COMMAND_TIMEOUT",
        "commandId": "1b4c81aa-3c5f-4c14-8f9e-1c0fbe9d2c3d",
        "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
        "notifyType": "app",
        "status": "pending",
        "title": "命令超时：1b4c81aa-3c5f-4c14-8f9e-1c0fbe9d2c3d",
        "content": "命令超时\\ndeviceId=...\\ncommandId=...\\nstatus=timeout\\ndetail=ack timeout after 30s\\n",
        "errorMessage": "",
        "createdAt": "2025-12-15T10:00:31Z",
        "sentAt": null,
        "deliveredAt": null,
        "readAt": null
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 15. 获取设备命令通知详情

**GET** `/devices/{deviceId}/command-notifications/{notificationId}`

权限：`device:control`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "notificationId": "a4b3dfc4-55e6-4dd3-9f37-6c3c5a2e8b0c",
    "eventId": "b7a5c0a9-43a8-4a3d-9f7c-0b5b3c8ac1b2",
    "eventType": "COMMAND_TIMEOUT",
    "commandId": "1b4c81aa-3c5f-4c14-8f9e-1c0fbe9d2c3d",
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "notifyType": "app",
    "status": "pending",
    "title": "命令超时：1b4c81aa-3c5f-4c14-8f9e-1c0fbe9d2c3d",
    "content": "命令超时\\ndeviceId=...\\ncommandId=...\\nstatus=timeout\\ndetail=ack timeout after 30s\\n",
    "errorMessage": "",
    "createdAt": "2025-12-15T10:00:31Z",
    "sentAt": null,
    "deliveredAt": null,
    "readAt": null
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 16. 获取设备命令通知统计（用于列表筛选/未读计数）

**GET** `/devices/{deviceId}/command-notifications/stats`

权限：`device:control`

查询参数：
- `startTime`, `endTime`（可选，ISO8601；必须同时提供，用于按时间窗口统计）
- `notifyType`（可选：app/sms/email/wechat）
- `bucket`（可选：1h/1d；需要同时提供 startTime+endTime，用于按时间桶聚合）

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "window": null,
    "notifyType": "",
    "bucket": "",
    "totals": { "total": 1, "unread": 1 },
    "byStatus": [{ "status": "pending", "count": 1 }],
    "byNotifyType": [{ "notifyType": "app", "count": 1 }],
    "byEventType": [{ "eventType": "COMMAND_TIMEOUT", "count": 1 }],
    "byBucket": []
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 17. 标记设备命令通知为已读

**PUT** `/devices/{deviceId}/command-notifications/{notificationId}/read`

权限：`device:control`

说明：该接口是幂等的；重复调用会返回相同的 `readAt`。

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "notificationId": "a4b3dfc4-55e6-4dd3-9f37-6c3c5a2e8b0c",
    "readAt": "2025-12-15T10:01:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```
