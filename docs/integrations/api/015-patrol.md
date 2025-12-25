# 巡查上报接口（移动端 MVP）

## 1. 巡查上报列表

**GET** `/patrol/reports`

用途：获取巡查上报列表（支持分页与筛选）。

查询参数：

- `page`, `pageSize`
- `stationId`（UUID，可选）
- `reporterId`（UUID，可选）
- `status`（`submitted` / `reviewed` / `archived`，可选）
- `startTime`, `endTime`（RFC3339 UTC，可选）

返回示例：

```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "reportId": "11111111-1111-1111-1111-111111111111",
        "stationId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
        "stationName": "北坡监测点A",
        "stationCode": "DEMO001",
        "taskId": null,
        "status": "submitted",
        "notes": "发现裂缝，已拍照留存。",
        "attachments": [
          { "url": "https://example.com/patrol/photo-1.jpg", "type": "image", "name": "photo-1.jpg", "size": 245812 }
        ],
        "latitude": 21.6847,
        "longitude": 108.3516,
        "reportedBy": "00000000-0000-0000-0000-000000000001",
        "metadata": { "source": "mobile" },
        "createdAt": "2025-12-15T10:00:00Z",
        "updatedAt": "2025-12-15T10:00:00Z"
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 2. 巡查上报详情

**GET** `/patrol/reports/{reportId}`

用途：查询指定巡查上报详情。

返回示例：

```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "reportId": "11111111-1111-1111-1111-111111111111",
    "stationId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "stationName": "北坡监测点A",
    "stationCode": "DEMO001",
    "taskId": null,
    "status": "submitted",
    "notes": "发现裂缝，已拍照留存。",
    "attachments": [
      { "url": "https://example.com/patrol/photo-1.jpg", "type": "image", "name": "photo-1.jpg", "size": 245812 }
    ],
    "latitude": 21.6847,
    "longitude": 108.3516,
    "reportedBy": "00000000-0000-0000-0000-000000000001",
    "metadata": { "source": "mobile" },
    "createdAt": "2025-12-15T10:00:00Z",
    "updatedAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 3. 创建巡查上报

**POST** `/patrol/reports`

用途：提交一条巡查上报（可选绑定站点/任务，可携带附件与定位）。

请求示例：

```json
{
  "stationId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
  "notes": "发现裂缝，已拍照留存。",
  "attachments": [
    { "url": "https://example.com/patrol/photo-1.jpg", "type": "image", "name": "photo-1.jpg", "size": 245812 }
  ],
  "latitude": 21.6847,
  "longitude": 108.3516,
  "metadata": { "source": "mobile" }
}
```

返回示例：

```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "reportId": "11111111-1111-1111-1111-111111111111",
    "stationId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    "stationName": "北坡监测点A",
    "stationCode": "DEMO001",
    "taskId": null,
    "status": "submitted",
    "notes": "发现裂缝，已拍照留存。",
    "attachments": [
      { "url": "https://example.com/patrol/photo-1.jpg", "type": "image", "name": "photo-1.jpg", "size": 245812 }
    ],
    "latitude": 21.6847,
    "longitude": 108.3516,
    "reportedBy": "00000000-0000-0000-0000-000000000001",
    "metadata": { "source": "mobile" },
    "createdAt": "2025-12-15T10:00:00Z",
    "updatedAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```
