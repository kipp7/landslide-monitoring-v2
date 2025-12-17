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
    "updated": ["device.offline_threshold_s"]
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

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "version": "2.0.0",
    "uptimeS": 86400,
    "postgres": { "status": "healthy" },
    "redis": { "status": "healthy" },
    "clickhouse": { "status": "healthy" },
    "kafka": { "status": "healthy" },
    "emqx": { "status": "healthy" }
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
- `todayDataCount` 来自 ClickHouse（按 received_ts 统计）
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
