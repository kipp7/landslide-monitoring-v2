---
title: 09-gps-deformations
type: note
permalink: landslide-monitoring-v2-mainline/docs/integrations/api/09-gps-deformations
---

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
- 若设备端使用不同的 metric key（例如自定义 GPS 字段名），可通过 `latKey/lonKey/altKey` 覆盖默认值。

### 2.2 获取 GPS 派生分析结果

**GET** `/gps/deformations/{deviceId}/analysis`

权限：`data:analysis`

查询参数：

- `timeRange`：相对范围（例如 `7d` / `24h`）
- `startTime`（可选，RFC3339 UTC）
- `endTime`（可选，RFC3339 UTC）
- `limit`（默认 200，最大 5000）

返回：

- `qualityScore`
- `trendDiagnostics`
  - `direction`
  - `changeMm`
  - `slopeMmPerHour`
  - `durationHours`
  - `regressionFitR2`
  - `accelerationMmPerHour2`
  - `averageStepMm`
  - `volatilityMm`
  - `sampleIntervalSeconds`
- `ceemd`
  - `imfs`
  - `residue`
  - `energyDistribution`
  - `dominantFrequencies`
  - `qualityScore`
  - `reconstructionError`
  - `orthogonality`
- `prediction`
  - `confidence`
  - `shortTerm`
  - `longTerm`
  - `thresholdForecast`
    - `thresholdsMm.blue/yellow/red`
    - `shortTerm.blue/yellow/red`
    - `longTerm.blue/yellow/red`
    - `etaHours/etaDays/firstTimestamp`
  - `confidenceIntervals`

说明：

- 当前 Desk `GpsMonitoringPage` 已优先消费该接口的高阶分析结果。
- CEEMD / prediction 展示与导出当前都已进入这条 `v1` 分析链。
- 当前 `trendDiagnostics + thresholdForecast + confidenceIntervals` 已进入专项 proof、页面 proof、导出 proof 与主线总 proof。
- 当前 `trendDiagnostics.slopeMmPerHour` 已改为基于真实时间轴的回归趋势，不再只按首尾差分计算。

## 3) Legacy 兼容分析接口（Desk 当前已消费）

### 3.1 获取 GPS 综合分析结果

**GET** `/api/gps-deformation/{deviceId}`

说明：

- 当前 Desk `GpsMonitoringPage` 已开始消费该接口的高阶分析结果。
- 当前主线已开始从该 legacy 分析口径迁移到 `/api/v1/gps/deformations/{deviceId}/analysis`。
- 当前返回除了位移点序列外，还包含：
  - `results.ceemdDecomposition`
  - `results.ceemdAnalysis`
  - `results.trendDiagnostics`
  - `results.prediction`

当前 Desk 实际消费口径：

- CEEMD 分解曲线
- 能量分布
- 短期预测
- 长期预测
- 分析结果导出 / 综合报告导出