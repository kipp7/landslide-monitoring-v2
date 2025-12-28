# GPS 基准点（Baselines）

本模块对应参考区的“基准点管理 / GPS 形变”的一部分能力（参考区：`frontend/app/baseline-management`、`frontend/app/api/baselines/*`）。

v2 约束：

- GPS 原始时序数据在 ClickHouse（`telemetry_raw`）；
- 基准点属于业务配置/元数据，存放在 PostgreSQL（`gps_baselines`）；
- Web 只能通过 v2 API 访问，不允许 Supabase 直连或前端写死逻辑。

兼容说明：

- 为避免旧系统前端/运营脚本依赖缺失，api-service 同时提供 legacy 兼容路径：`/api/baselines/*`（返回 `{success,data}` 形状）；其语义与本文档的 v1 端点保持一致。
- 当 PostgreSQL 未配置或不可用时，legacy `/api/baselines/*` 会返回 200 fallback/disabled payload（避免旧页面直接 401/503）。
- 额外 legacy 别名（对齐参考区 `frontend/app/api/baselines/*`）：
  - `POST /api/baselines/{deviceId}/auto-establish-advanced` → `POST /api/baselines/{deviceId}/auto-establish`
  - `POST /api/baselines/{deviceId}/auto-establish-simple` → `POST /api/baselines/{deviceId}/auto-establish`
  - `GET /api/baselines/{deviceId}/quality-assessment` → `GET /api/baselines/{deviceId}/quality-check`（不实现参考区 Supabase 的打分/函数逻辑）

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

### 2.5 可用设备列表（有 GPS 数据但没有 baseline）

**GET** `/gps/baselines/available-devices`

权限：`device:view`

Query（均为可选）：

- `lookbackDays`：回溯天数（默认 30，最大 365）
- `latKey`：GPS 纬度 key（默认 `gps_latitude`）
- `lonKey`：GPS 经度 key（默认 `gps_longitude`）
- `limit`：ClickHouse 筛选的 device 个数上限（默认 10000）

返回（`data`）：

- `availableDevices`：UUID 列表（有 GPS 数据且无 baseline）
- `totalGpsDevices`：在 devices 表中确认为有效的 GPS 设备数（过滤 `revoked`）
- `devicesWithBaseline`：上述设备中已有 baseline 的数
- `devicesNeedingBaseline`：上述设备中还需要建立 baseline 的数

### 2.6 自动建立基准点（Auto establish）

**POST** `/gps/baselines/{deviceId}/auto-establish`

权限：`device:update`

Body（可选的都有默认值，但 body 本身为必填）：

```json
{
  "pointsCount": 20,
  "lookbackDays": 30,
  "latKey": "gps_latitude",
  "lonKey": "gps_longitude",
  "altKey": "gps_altitude"
}
```

说明：

- 将在 ClickHouse 中拉取设备近 `lookbackDays` 天的最新 `pointsCount` 个 GPS 点，计算平均坐标，并写入 PostgreSQL `gps_baselines`（`method=auto`）。
- 有效点数 < 10 会返回 `400`（`message: 数据点不足`）。

返回（`data`）：

- `deviceId`、`pointsUsed`、`baseline`、`statistics.positionAccuracyMeters`、`statistics.timeRange` 等。

### 2.7 基准点质量检查（Quality check）

**GET** `/gps/baselines/{deviceId}/quality-check`

权限：`device:view`

Query（均为可选）：

- `pointsCount`：用于质量检查的 GPS 点数（默认 200，最大 5000），有效点数 < 10 会返回 400
- `lookbackDays`：回溯天数（默认 30）
- `latKey`、`lonKey`、`altKey`：对应 ClickHouse 的 sensor_key

返回（`data`）：

- `driftMeters.mean/std/p95/max`：样本点相对 baseline 的距离统计（单位：米）
- `recommendation.level`：`good|warn|bad`（依据 `p95`：`<=2m -> good`，`<=5m -> warn`，否则 `bad`）
- `baselineAgeHours`：基准点计算时间距离现在的小时数
