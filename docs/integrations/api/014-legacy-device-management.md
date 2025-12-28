# 14) Legacy 设备管理 API 兼容（`/api/*`）

说明：
- 本文档记录参考区旧前端 `legacy-frontend/app/api/*` 的兼容端点（**不进入** `/api/v1` OpenAPI 契约）。
- 兼容层默认受 RBAC 保护：`data:view`。
- 当 PostgreSQL 未配置（`pg=null`）时，部分旧端点会返回 `200` 的 demo/fallback 数据并跳过鉴权（对齐参考区旧前端默认无鉴权的调用方式）。

## 1) 设备管理（分层）

- `GET /api/device-management/hierarchical`：返回设备分层/汇总（用于旧页面的数据源）

## 2) IoT 设备映射

- `GET /api/iot/devices/mappings`：返回设备映射列表（v2 中映射到 devices/stations）
- `GET /api/iot/devices/{deviceId}`：返回单设备映射详情（支持 UUID / device_name / legacy id）

## 3) 监测站信息

- `GET /api/monitoring-stations`：返回监测站（设备）列表；会从 `devices.metadata` 回填 `station_name`/`location_name`/`risk_level`/`sensor_types`/`chart_legend_name`/`status` 等字段；支持 `chartType` 参数返回图表配置（含 `deviceLegends`；与 `GET /api/monitoring-stations/chart-config` 对齐）
- `GET /api/monitoring-stations/chart-config?type=...`：返回图表配置（兼容旧前端 chart config 拉取路径；`type` 也可用 `chartType`；包含基于 `devices.metadata.chart_legend_name` 的 deviceLegends）
- `PUT /api/monitoring-stations/chart-legends`：批量更新图例配置（兼容入口；写入 `devices.metadata.chart_legend_name`）
- `PUT /api/monitoring-stations?deviceId=...`：更新单监测站（设备）配置（写入 `devices.metadata`，用于 legacy UI 的配置保存；如需同步更新 `stations`/`devices.status`，使用 `PUT /api/monitoring-stations/{deviceId}`）
- `POST /api/monitoring-stations`：批量更新图例配置（写入 `devices.metadata.chart_legend_name`）
- `GET /api/monitoring-stations/{deviceId}`：返回单监测站（设备）信息
- `PUT /api/monitoring-stations/{deviceId}`：更新单监测站（设备）信息（支持 `station_name`/`latitude`/`longitude`/`status`，其余字段写入 `devices.metadata`）
- `DELETE /api/monitoring-stations/{deviceId}`：软删除（`devices.status = revoked`）

## 4) 聚合接口

- `POST /api/data-aggregation`：兼容旧的聚合入口（`hierarchy_stats` / `network_stats` / `device_summary` / `real_time_dashboard`），当前实现映射到 v2 的 Postgres/ClickHouse 数据源与 dashboard 计算逻辑
- PostgreSQL 未配置（`pg=null`）时：`POST /api/data-aggregation` 返回 `200`，携带 `is_fallback: true` 与最小可用 demo 数据（默认 `device_1~3`）。
