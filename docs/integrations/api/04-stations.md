# 站点管理接口（v2：UUID）

站点是“边坡/监测点位”的业务实体，一个站点可绑定多个设备。

## 1. 获取站点列表

**GET** `/stations`

权限：`device:view`

查询参数：
- `page`, `pageSize`
- `keyword`
- `status`（active/inactive/maintenance）

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "stationId": "7b0f2d41-0b25-4d16-9a38-7283a4dcdb4e",
        "stationCode": "LM001",
        "stationName": "龙门监测点",
        "status": "active",
        "latitude": 21.6847,
        "longitude": 108.3516,
        "metadata": { "riskArea": "A" },
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-12-15T10:00:00Z"
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 2. 获取站点详情

**GET** `/stations/{stationId}`

权限：`device:view`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "stationId": "7b0f2d41-0b25-4d16-9a38-7283a4dcdb4e",
    "stationCode": "LM001",
    "stationName": "龙门监测点",
    "status": "active",
    "latitude": 21.6847,
    "longitude": 108.3516,
    "metadata": { "riskArea": "A", "note": "重点监测" },
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 3. 创建站点

**POST** `/stations`

权限：`device:create`

请求（示例）：
```json
{
  "stationCode": "LM001",
  "stationName": "龙门监测点",
  "latitude": 21.6847,
  "longitude": 108.3516,
  "metadata": {
    "riskArea": "A",
    "note": "重点监测"
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
    "stationId": "7b0f2d41-0b25-4d16-9a38-7283a4dcdb4e"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 4. 更新站点

**PUT** `/stations/{stationId}`

权限：`device:update`

请求（示例）：
```json
{
  "stationName": "龙门监测点（改名）",
  "status": "maintenance",
  "metadata": { "note": "设备检修中" }
}
```

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "stationId": "7b0f2d41-0b25-4d16-9a38-7283a4dcdb4e",
    "updatedAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 5. 删除站点

**DELETE** `/stations/{stationId}`

权限：`device:delete`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {},
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```
