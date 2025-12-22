# GPS 形变（Deformations）

本模块对应参考区的“GPS 形变/趋势分析”的 **API-only** 闭环：基于 PostgreSQL 的基准点（baseline）与 ClickHouse 的 GPS 遥测，计算位移时间序列。

v2 约束：

- GPS 原始时序数据在 ClickHouse（`telemetry_raw`）；
- baseline 在 PostgreSQL（`gps_baselines`）；
- Web 只能通过 v2 API 访问，不允许前端直连或写死计算逻辑。

## 1) 约定（传感器 key）

默认使用以下遥测指标（可通过 query 覆盖）：

- `gps_latitude`：纬度（度）
- `gps_longitude`：经度（度）
- `gps_altitude`：海拔（米，可选）

## 2) API（/api/v1）

### 2.1 获取位移时间序列

**GET** `/gps/deformations/{deviceId}/series`

权限：`data:analysis`

查询参数：

- `startTime`（RFC3339 UTC）
- `endTime`（RFC3339 UTC）
- `interval`：`1m|5m|1h|1d`（默认 `1h`）
- `latKey`（默认 `gps_latitude`）
- `lonKey`（默认 `gps_longitude`）
- `altKey`（可选，默认不启用；若启用且 baseline/数据均有 altitude，则返回垂直位移）
- `limit`（默认 20000，最大 200000）

返回：

- `baseline`：来自 `gps_baselines.baseline`（并补充 `method/pointsCount/computedAt`）
- `points[]`：每个时间桶的 `latitude/longitude/altitude` 与 `horizontalMeters/verticalMeters/distanceMeters`

说明：

- `horizontalMeters`：Haversine（球面）距离；
- `verticalMeters`：`altitude - baseline.altitude`（仅当两者都有 altitude）；
- `distanceMeters`：有垂直位移时为三维距离，否则等于 `horizontalMeters`。

