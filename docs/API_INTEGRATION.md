# API 对接说明（Desk）

## 目标

桌面端先用 Mock 数据把 UI 做精致，并提前封装 API 接口层；后续切换到真实后端时，只替换数据源实现，不重写页面逻辑。

## 模式切换

- 入口：`/app/settings` → “API 模式”
- `mock`：走 `apps/desk/src/api/mockClient.ts`
- `http`：走 `apps/desk/src/api/httpClient.ts`
- Base URL：在设置中配置（默认 `http://127.0.0.1:3000`）
- 鉴权：HTTP 请求会带 `Authorization: Bearer <token>`（token 来自 `apps/desk/src/stores/authStore.ts`）

## 统一响应（OpenAPI SuccessResponse）

后端 v2 OpenAPI 统一响应格式：

```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {},
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

桌面端 `fetchJson()` 已支持识别 `success: boolean` 并自动解包 `data`；当 `success=false` 时会把 `message/traceId` 拼到错误信息里，便于联调定位。

## 当前 HTTP 端点（暂定）

以 `apps/desk/src/api/httpClient.ts` 为准（当前仍以 legacy `/api/*` 为主，后续可切到 `/api/v1`）：

- `GET {baseUrl}/api/dashboard/summary`
- `GET {baseUrl}/api/dashboard/weekly-trend`
- `GET {baseUrl}/api/monitoring-stations`
- `GET {baseUrl}/api/devices?station_id={stationId}`
- `GET {baseUrl}/api/gps-deformation/{deviceId}?days={n}`
- `GET|PUT|DELETE|POST {baseUrl}/api/baselines*`
- `GET {baseUrl}/api/system/status`

## Desk 路由约定（用于联动跳转/验收）

- 设备管理中心：`/app/device-management`
  - `tab=status`：设备状态监控
    - `deviceId=<id>`：默认选中某设备
    - `stationId=<id>`：按站点过滤设备列表（用于从“监测站详情”一键跳转）
  - `tab=management`：监测站管理
    - `stationId=<id>`：默认打开某站点详情
  - `tab=baselines`：GNSS 基线管理

- GPS 形变监测：`/app/gps-monitoring`
  - `deviceId=<id>`：默认选中某 GNSS 设备
  - `range=7d|15d|30d|...`：时间窗（见页面实现）
  - `autoRefresh=0|1`：自动刷新

## 联调检查清单

1) `/app/settings` 切到 `http`，把 Base URL 指向实际 API（例如 `http://localhost:8080`）
2) 观察请求头：是否携带 `Authorization`
3) 若报 401/403：检查后端 RBAC 与 token 逻辑
4) 若报超时：桌面端会提示 `请求超时（xxxxms）`，可在 `httpClient` 中调整默认超时

