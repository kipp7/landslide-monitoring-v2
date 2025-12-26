# Legacy compat aliases (v2)

参考区 `frontend/app/api` 中存在若干“优化/真实数据”版本的 API route（例如 `device-management-optimized`、`device-management-real`、`monitoring-stations-optimized`）。

v2 不复刻参考区的 Supabase 直连实现，而是在 v2 api-service 的 legacy compat 层为这些路径提供**别名**，统一转发到 v2 已有的兼容端点（Postgres + ClickHouse）。

## 别名列表

- `GET /api/device-management-optimized` → `GET /api/device-management`
- `GET /api/device-management-real` → `GET /api/device-management/hierarchical`
- `GET /api/device-management-real-db` → `GET /api/device-management/hierarchical`
- `POST /api/device-management-real/diagnostics` → `POST /api/device-management/diagnostics`
- `GET /api/monitoring-stations-optimized` → `GET /api/monitoring-stations`
- `PUT /api/monitoring-stations-optimized` → `PUT /api/monitoring-stations`

同时也适用于 legacy nginx 前缀别名：

- `/iot/api/<same-paths>`

