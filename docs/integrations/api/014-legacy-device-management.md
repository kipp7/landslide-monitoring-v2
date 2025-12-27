# 14) Legacy 设备管理 API 兼容（`/api/*`）

说明：
- 本文档记录参考区旧前端 `legacy-frontend/app/api/*` 的兼容端点（**不进入** `/api/v1` OpenAPI 契约）。
- 兼容层默认受 RBAC 保护：`data:view`。

## 1) 设备管理（分层）

- `GET /api/device-management/hierarchical`：返回设备分层/汇总（用于旧页面的数据源）

## 2) IoT 设备映射

- `GET /api/iot/devices/mappings`：返回设备映射列表（v2 中映射到 devices/stations）
- `GET /api/iot/devices/{deviceId}`：返回单设备映射详情（支持 UUID / device_name / legacy id）

## 3) 监测站信息

- `GET /api/monitoring-stations`：返回监测站（设备）列表；支持 `chartType` 参数返回图表配置占位
- `PUT /api/monitoring-stations?deviceId=...`：更新单监测站（设备）配置（写入 `devices.metadata`；若包含 `station_name`/`latitude`/`longitude`/`status` 则同步更新 `stations`/`devices.status`）
- `POST /api/monitoring-stations`：批量更新图例配置（写入 `devices.metadata.chart_legend_name`）
- `GET /api/monitoring-stations/{deviceId}`：返回单监测站（设备）信息
- `PUT /api/monitoring-stations/{deviceId}`：更新单监测站（设备）信息（支持 `station_name`/`latitude`/`longitude`/`status`，其余字段写入 `devices.metadata`）
- `DELETE /api/monitoring-stations/{deviceId}`：软删除（`devices.status = revoked`）

## 4) 聚合接口

- `POST /api/data-aggregation`：兼容旧的聚合入口（`hierarchy_stats` / `network_stats` / `device_summary` / `real_time_dashboard`），当前实现映射到 v2 的 Postgres/ClickHouse 数据源与 dashboard 计算逻辑
