# Legacy disabled endpoints (v2)

参考区 `frontend/app/api` 中包含若干 **调试/管理** 类 Next.js API routes（如 inspect/db-admin/test-db）。这些端点在 v2 中**明确不提供**，并在 v2 api-service 的 legacy compat 层做了显式禁用响应，避免误用与安全风险。

## 禁用列表

以下路径在 v2 返回 `403`（`{ success:false, error:"disabled", ... }`）：

- `GET|POST /api/db-admin`
- `GET|POST /api/inspect-db`
- `GET|POST /api/inspect-tables`
- `GET|POST /api/inspect-all-tables`
- `GET|POST /api/test-db`
- `GET|POST /api/test-expert-health`

同时也会在 legacy nginx 前缀别名下返回相同响应：

- `GET|POST /iot/api/<same-paths>`

## 替代方案

- 生产调试请使用 v2 的受控运维入口（`/ops/*` 页面 + 对应的 v2 API），并通过 RBAC/审计收敛能力。
- 不允许通过前端/Next route 直接执行 SQL 或枚举表结构。

