---
title: 07-system
type: note
permalink: landslide-monitoring-v2-mainline/docs/integrations/api/07-system
---

# 系统接口（v2）

系统接口用于读取系统配置、查看日志与健康状态。单机部署下重点是“可观测 + 可恢复”。

## 1. 获取系统配置（公开配置）

**GET** `/system/configs`

权限：`system:config`

说明：
- 仅返回 `system_configs.is_public=true` 的配置（其他配置仅管理员可见或不通过 API 暴露）

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": [
    {
      "key": "system.name",
      "value": "滑坡监测系统",
      "type": "string",
      "description": "系统名称"
    }
  ],
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 2. 更新系统配置

**PUT** `/system/configs`

权限：`system:config`

请求：
```json
{
  "configs": [
    { "key": "device.offline_threshold_s", "value": "300" }
  ]
}
```

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "updated": 1
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

当前与命令成功通知策略直接相关的系统配置键：

- `command.success_notification.system_default`
  - 取值：`silent | always_notify`
  - 含义：当命令未命中 command-type default 且未显式 override 时的系统默认策略
- `command.success_notification.command_type_defaults`
  - 类型：JSON object
  - 值示例：
```json
{
  "set_config": "always_notify",
  "reboot": "always_notify",
  "restart_device": "always_notify"
}
```
  - 含义：按 `commandType` 指定 success-notification 默认策略

## 2.1 获取命令成功通知默认表

**GET** `/system/command-success-notification-policy`

权限：`system:config`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "systemDefault": "silent",
    "commandTypeDefaults": {
      "set_config": "always_notify",
      "reboot": "always_notify"
    }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 2.2 更新命令成功通知默认表

**PUT** `/system/command-success-notification-policy`

权限：`system:config`

请求：
```json
{
  "systemDefault": "silent",
  "commandTypeDefaults": {
    "set_config": "always_notify",
    "reboot": "always_notify",
    "restart_device": "always_notify"
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
    "systemDefault": "silent",
    "commandTypeDefaults": {
      "set_config": "always_notify",
      "reboot": "always_notify",
      "restart_device": "always_notify"
    }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 3. 获取操作日志

**GET** `/system/logs/operation`

权限：`system:log`

查询参数：
- `page`, `pageSize`
- `userId`（UUID）
- `module`
- `action`
- `startTime`, `endTime`

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "logId": "c1c2c3c4-1111-2222-3333-444455556666",
        "userId": "a1b2c3d4-1111-2222-3333-444455556666",
        "module": "device",
        "action": "create",
        "targetId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
        "message": "create device",
        "createdAt": "2025-12-15T10:00:00Z"
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 4. 获取 API 访问统计

**GET** `/system/logs/api-stats`

权限：`system:log`

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "today": {
      "totalRequests": 10000,
      "avgResponseTimeMs": 50,
      "errorRate": 0.01
    }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 5. 获取系统状态（健康检查）

**GET** `/system/status`

权限：`system:log`

说明：
- `/system/status` 仍然是中心侧健康摘要模型
- `fieldEdge` 为可选的 RK3568 边缘状态只读扩展区块
- `fieldEdge` 只消费已有 latest evidence artifacts，不在请求路径内执行 SSH / 串口 / 板端探测

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "uptimeS": 86400,
    "postgres": { "status": "healthy" },
    "clickhouse": { "status": "healthy" },
    "kafka": { "status": "configured" },
    "emqx": { "status": "unknown" },
    "source": "health_summary",
    "note": "当前展示的是服务健康摘要，不表示真实 CPU/内存/磁盘占用。",
    "items": [
      { "key": "postgres", "label": "PostgreSQL", "status": "healthy", "detail": "healthy" },
      { "key": "clickhouse", "label": "ClickHouse", "status": "healthy", "detail": "healthy" },
      { "key": "kafka", "label": "Kafka", "status": "healthy", "detail": "configured" }
    ],
    "fieldEdge": {
      "available": true,
      "stale": false,
      "detail": "RK3568 latest evidence loaded from local report artifacts",
      "source": "rk3568_field_link_monitor",
      "generatedAt": "2026-04-10T16:43:28.403Z",
      "currentBoundary": "rk3568-edge-link-monitor-ready",
      "accepted": true,
      "summary": {
        "overallLevel": "attention",
        "score": 80,
        "networkMode": "sta_connected",
        "serialOpen": true,
        "mqttConnected": true,
        "portStatus": "online",
        "spoolPending": 0,
        "rejectedMessages": 2,
        "lastPublishedAgeSeconds": 0
      },
      "nodes": [
        {
          "fieldNodeId": "A",
          "deviceId": "00000000-0000-0000-0000-000000000001",
          "installLabel": "FIELD-NODE-A",
          "status": "online",
          "telemetryMessages": 16,
          "commandForwards": 0,
          "ackPublishes": 0,
          "lastTelemetryAgeSeconds": 1,
          "lastAckAgeSeconds": null
        }
      ],
      "soak": {
        "generatedAt": "2026-04-10T16:46:16Z",
        "accepted": true,
        "currentBoundary": "rk3568-center-soak-ready",
        "cleanWindowRounds": 2,
        "allAcked": true,
        "maxBoardObservationSchemaRejectedDelta": 0
      }
    }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 6. 健康检查（公开）

**GET** `/health`

说明：
- 用于部署与监控系统探活（例如 Nginx/Prometheus/自建脚本）
- 推荐不强制鉴权（避免“监控也需要 token”导致运维复杂），但应限制来源（内网/反向代理）

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "status": "ok",
    "time": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 7. 仪表盘汇总

**GET** `/dashboard`

权限：`data:view`

说明：
- `todayDataCount` 来自 ClickHouse（按 `received_ts` 统计北京时间自然日，范围为北京时间 00:00 至当前时刻）
- `pendingAlerts` 由告警事件流聚合得到

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "todayDataCount": 123456,
    "onlineDevices": 10,
    "offlineDevices": 2,
    "pendingAlerts": 3,
    "alertsBySeverity": { "low": 1, "medium": 1, "high": 1, "critical": 0 },
    "lastUpdatedAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 8. 仪表盘一周趋势

**GET** `/dashboard/weekly-trend`

权限：`data:view`

说明：
- 近 7 天趋势由两部分聚合得到：
  - ClickHouse 遥测表中的 `rainfall_mm`
  - PostgreSQL `alert_events` 中的告警事件
- 缺失日补 0
- `source/note` 用于向 Desk 明确说明该趋势的来源与口径

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "labels": ["03-08", "03-09", "03-10", "03-11", "03-12", "03-13", "03-14"],
    "rainfallMm": [0, 12.5, 8, 0, 5.5, 18, 6],
    "alertCount": [0, 1, 0, 0, 2, 1, 0],
    "source": "derived_summary",
    "note": "近 7 天按 telemetry `rainfall_mm` 与 `alert_events` 聚合生成，缺失日补 0。"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```
