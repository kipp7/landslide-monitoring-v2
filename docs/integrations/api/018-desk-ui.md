# 18) Desk 桌面端（apps/desk）API 对接与映射

说明：
- `apps/desk` 支持 `mock` / `http` 两种模式（`/app/settings` 可切换）。
- 本文档记录**桌面端当前 HTTP 客户端实现**与**OpenAPI(/api/v1) 契约**的差异，便于联调与生产对接。
- 当前 `apps/desk/src/api/httpClient.ts` 走 legacy `/api/*` 路径，且默认不做 `SuccessResponse` 解包；若后端返回统一包裹，需要在桌面端增加 adapter（或改为 `/api/v1`）。

## 1) 开关与运行方式

- API 模式入口：`/app/settings` → “API 模式”
- `mock`：走 `apps/desk/src/api/mockClient.ts`
- `http`：走 `apps/desk/src/api/httpClient.ts`
- baseUrl：`desk_settings_v1.apiBaseUrl`（默认 `http://127.0.0.1:3000`，可改为实际 API 网关地址）
- 鉴权：HTTP 请求会带 `Authorization: Bearer <token>`（`token` 来自 `apps/desk/src/stores/authStore.ts`）

## 2) 端点清单（当前实现）

以 `apps/desk/src/api/httpClient.ts` 为准：

### auth

- `auth.login/logout`：当前为 stub（不发请求，仅生成本地 token），后续需要对接 `docs/integrations/api/01-auth.md`

### dashboard

- `GET {baseUrl}/api/dashboard/summary` → `DashboardSummary`
- `GET {baseUrl}/api/dashboard/weekly-trend` → `WeeklyTrend`

### stations

- `GET {baseUrl}/api/monitoring-stations` → `Station[]`（legacy 兼容端点，见 `docs/integrations/api/014-legacy-device-management.md`）

### devices

- `GET {baseUrl}/api/devices?station_id={stationId}` → `Device[]`（`station_id` 可选）

### gps

- `GET {baseUrl}/api/gps-deformation/{deviceId}?days={n}` → `GpsSeries`

### baselines

- `GET {baseUrl}/api/baselines` → `Baseline[]`
- `PUT {baseUrl}/api/baselines/{deviceId}` body：`Baseline`（部分字段可缺省）→ `Baseline`
- `DELETE {baseUrl}/api/baselines/{deviceId}` → `void`
- `POST {baseUrl}/api/baselines/{deviceId}/auto-establish` body：`{}` → `Baseline`

### system

- `GET {baseUrl}/api/system/status` → `SystemStatus`

## 3) 与 OpenAPI(/api/v1) 的主要差异

### 3.1 路径与模块归属

- `GET /api/dashboard/summary`（desk） vs `GET /api/v1/dashboard`（OpenAPI）
- `GET /api/system/status`（desk） vs `GET /api/v1/system/status`（OpenAPI）
- `GET /api/baselines*`（desk） vs `GET|PUT|DELETE /api/v1/gps/baselines*`（OpenAPI）
- `GET /api/gps-deformation/{deviceId}`（desk） vs `GET /api/v1/gps/deformations/{deviceId}/series`（OpenAPI，见 `docs/integrations/api/09-gps-deformations.md`）

### 3.2 响应包裹（SuccessResponse）

OpenAPI 统一响应格式包含 `code/message/timestamp/traceId/data`（见 `docs/integrations/api/api-design.md`）。
当前 desk `httpClient.fetchJson()` 直接返回 JSON 本体，不会自动解包 `data`：

- 若后端按 OpenAPI 返回，需要：`fetchJson()` 解包 `data`（并在错误分支解析 `message/traceId`）。
- 或者后端提供兼容的“直出”端点（继续走 `/api/*`）。

### 3.3 GPS 数据形态

desk 的 `GpsSeries` 是简化模型（`points: {ts, dispMm}[]`）。
OpenAPI 的 GPS 形变序列是基于 baseline + 经纬度的聚合结果（水平/垂直/三维位移），对接时需要：

- 在 desk 侧增加转换层（从 OpenAPI points 计算/映射成 `dispMm`），或
- 升级 desk 侧模型与图表逻辑（推荐，保留更多工程信息）。

## 4) 联调检查清单（桌面端）

- `/app/settings` 切换到 `http`，将 baseUrl 改为实际服务地址（示例：`http://localhost:8080`）
- 验证 token：HTTP 请求头是否携带 `Authorization`
- 若出现 “HTTP 401/403”：检查后端 RBAC 权限与 token 生成逻辑
- Postman 快速回归：`docs/tools/postman/README.md`

## 5) 待办（对接落地）

- auth：将 `auth.login/logout` 改为真实请求，对齐 `docs/integrations/api/01-auth.md`
- 统一：决定 desk 走 `/api/v1` 还是继续 `/api/*`（legacy），并实现对应的 response adapter
- GPS：对齐 `docs/integrations/api/09-gps-deformations.md` 的数据形态与参数（start/end/interval 等）

