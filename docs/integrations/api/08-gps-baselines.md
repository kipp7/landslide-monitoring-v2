# GPS 基准点（Baselines）

本模块对应参考区的“基准点管理 / GPS 形变”的一部分能力（参考区：`frontend/app/baseline-management`、`frontend/app/api/baselines/*`）。

v2 约束：

- GPS 原始时序数据在 ClickHouse（`telemetry_raw`）；
- 基准点属于业务配置/元数据，存放在 PostgreSQL（`gps_baselines`）；
- Web 只能通过 v2 API 访问，不允许 Supabase 直连或前端写死逻辑。

## 1) 数据模型（PostgreSQL）

表：`gps_baselines`

- `device_id`（PK，UUID）：设备 ID
- `method`：`auto|manual`
- `points_count`：计算基准点使用的点数（可选）
- `baseline`（JSONB）：基准点内容（建议包含 `latitude`、`longitude`、`altitude`、`positionAccuracyMeters`、`satelliteCount`、`notes`）
- `computed_at`：计算时间（UTC）
- `updated_at`：更新时间（UTC）

DDL 来源：`docs/integrations/storage/postgres/tables/07-gps-baseline.sql`

## 2) API（/api/v1）

### 2.1 列出基准点

**GET** `/gps/baselines`

权限：`device:view`

查询参数：

- `page`（默认 1）
- `pageSize`（默认 20，最大 200）
- `keyword`（可选，按 deviceName 模糊）

### 2.2 查询单个设备的基准点

**GET** `/gps/baselines/{deviceId}`

权限：`device:view`

### 2.3 手动写入/更新基准点（Upsert）

**PUT** `/gps/baselines/{deviceId}`

权限：`device:update`

Body：

```json
{
  "method": "manual",
  "pointsCount": 20,
  "baseline": {
    "latitude": 21.6847,
    "longitude": 108.3516,
    "altitude": 12.3,
    "positionAccuracyMeters": 1.5,
    "satelliteCount": 12,
    "notes": "manual baseline"
  }
}
```

### 2.4 删除基准点

**DELETE** `/gps/baselines/{deviceId}`

权限：`device:update`

