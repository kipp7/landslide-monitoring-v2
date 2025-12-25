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
- `GET /api/monitoring-stations/{deviceId}`：返回单监测站（设备）信息

## 4) 聚合接口

- `POST /api/data-aggregation`：兼容旧的聚合入口（`hierarchy_stats` / `network_stats` / `device_summary` / `real_time_dashboard`），当前实现映射到 v2 的 Postgres/ClickHouse 数据源与 dashboard 计算逻辑

## 5) 设备管理工具（导出/报告/诊断）

说明：参考区在 `frontend/app/api/device-management/*` 下提供了若干“运营工具型”端点（原实现直连 Supabase/外部 AI）。v2 的兼容层改为基于 ClickHouse/Postgres 的最小可用实现，不做外部 AI 调用。

- `POST /api/device-management/export`：导出设备遥测（支持 `format=json|csv`；默认 `today`；权限：`data:export`）
- `GET /api/device-management/export`：导出统计信息（total/today/week/month；权限：`data:view`）
- `POST /api/device-management/reports`：生成基础运行报告（不依赖外部 AI；权限：`data:view`）
- `GET /api/device-management/reports`：获取可用报告类型与数据时间范围（权限：`data:view`）
- `POST /api/device-management/diagnostics`：设备诊断（在线/数据量/基准点/连接稳定性等；权限：`data:view`）
