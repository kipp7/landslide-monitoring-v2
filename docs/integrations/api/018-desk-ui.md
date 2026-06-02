---
title: 018-desk-ui
type: note
permalink: landslide-monitoring-v2-mainline/docs/integrations/api/018-desk-ui
---

# 18) Desk 桌面端（apps/desk）API 对接与映射

说明：
- `apps/desk` 支持 `mock` / `http` 两种模式（`/app/settings` 可切换）。
- 本文档记录**桌面端当前 HTTP 客户端实现**与**OpenAPI(/api/v1) 契约**的差异，便于联调与生产对接。
- 当前 `apps/desk/src/api/httpClient.ts` 走 legacy `/api/*` 路径，且默认不做 `SuccessResponse` 解包；若后端返回统一包裹，需要在桌面端增加 adapter（或改为 `/api/v1`）。
- 当前后端已补：
  - `/api/dashboard/summary`
  - `/api/dashboard/weekly-trend`
  - `/api/system/status`
  - `/api/v1/dashboard/weekly-trend`

## 1) 开关与运行方式

- API 模式入口：`/app/settings` → “API 模式”
- `mock`：走 `apps/desk/src/api/mockClient.ts`
- `http`：走 `apps/desk/src/api/httpClient.ts`
- baseUrl：`desk_settings_v1.apiBaseUrl`（当前主线默认 `http://127.0.0.1:8081`，可改为实际 API 网关地址）
- 鉴权：HTTP 请求会带 `Authorization: Bearer <token>`（`token` 来自 `apps/desk/src/stores/authStore.ts`）

当前主线 Desk 数据层状态：

- 已补 `httpTransport + httpMappers`
- 已补 `token + refreshToken` 会话承载
- 当前核心读取链已基本全面切到 v1
- 当前已补单独的 v1-only runtime proof：`scripts/dev/check-desk-http-v1-core.ps1`
- 当前 `stations/devices/baselines` 的 v1 列表读取已支持自动翻页
- 当前自动翻页已补大页数留证：`scripts/dev/check-desk-pagination-proof.ps1`
- 当前已补主线 Desk HTTP client 本体 proof：`scripts/dev/check-desk-http-client.ps1`
- 当前已补主路径级 proof：`scripts/dev/check-desk-user-journey.ps1`
- 当前已补基线页动作 proof：`scripts/dev/check-desk-baselines-actions.ps1`
- 当前已补一键复验入口：`scripts/dev/check-desk-mainline-proof.ps1`
- 当前一键复验入口现已输出结构化总报告
- 当前一键复验入口可选并入大页数压力场景：`-IncludePaginationStress`
- 当前保持：**不改页面布局与导航，只收口数据层**

## 2) 端点清单（当前实现）

以 `apps/desk/src/api/httpClient.ts` 为准：

### auth

- `auth.login()`：优先请求 `POST {baseUrl}/api/v1/auth/login`
- `auth.logout()`：best-effort 请求 `POST {baseUrl}/api/v1/auth/logout`
- HTTP 模式下手机号登录当前明确不接入；会返回错误提示而不是伪造会话

当前本地开发口径：

- 当前 `seed-demo.ps1` 已补本地演示账号：
  - `username=admin`
  - `password=123456`
- 当前 demo 场景已扩展为多状态：
  - 第二站点
  - 离线设备
  - warning 设备
  - 无 baseline 的 GNSS 设备
  - 缺 baseline 设备
  - 只读用户
- 当前 seed 执行链已改为 stdin → psql，避免临时文件拷贝导致的偶发失败
- 当前已补只读用户边界留证：`scripts/dev/check-desk-viewer-boundary.ps1`
- 登录页“快速体验”当前也已对齐到这组账号
- 若当前 `baseUrl` 为 `localhost/127.0.0.1` 且真实登录失败，Desk 会回落到 `token=dev`
- 当前优先路径已变为：
  - 先尝试真实 JWT 登录
  - 本地失败时再走 `dev` fallback
- 当前已补认证链留证：
  - `scripts/dev/check-desk-http-v1-core.ps1` 会验证 login / me / refresh / refresh 后继续访问核心接口
- 当前本地 RBAC demo 口径：
  - `auth/me.roles[*].displayName` 现已由 seed 真值修复为正常英文展示值（如 `Admin`）

### dashboard

- `GET {baseUrl}/api/v1/dashboard` → `DashboardSummary`（经 mapper 计算 `systemHealthPercent`）
- `GET {baseUrl}/api/v1/dashboard/weekly-trend` → `WeeklyTrend`

说明：

- `DashboardSummary.systemHealthPercent` 当前口径应理解为**业务运行健康度**，不是主机 CPU / 内存 / 磁盘占用。
- 当前建议组成：
  - 设备在线率
  - 数据新鲜度
  - 风险 / 告警压力

### stations

- `GET {baseUrl}/api/v1/stations?page=1&pageSize=200` → `SuccessResponse<StationList>`
- `GET {baseUrl}/api/v1/devices?page=1&pageSize=200` → 用于补站点 `deviceCount`

### devices

- `GET {baseUrl}/api/v1/devices?page=1&pageSize=200[&stationId={stationId}]` → `SuccessResponse<DeviceList>`
- `POST {baseUrl}/api/v1/devices/{deviceId}/commands` → 下发设备控制指令
- `GET {baseUrl}/api/v1/devices/{deviceId}/commands?page=1&pageSize=50` → 查询指令列表

### gps

- `GET {baseUrl}/api/gps-deformation/{deviceId}?days={n}` → `GpsSeries`
- `GET {baseUrl}/api/gps-deformation/{deviceId}?timeRange={label}&limit={n}` → `GpsDerivedAnalysis`（Desk 当前用于 GPS monitoring 的 CEEMD / prediction 展示块）
- `GET {baseUrl}/api/v1/gps/deformations/{deviceId}/analysis?timeRange={label}&limit={n}` → `GpsDerivedAnalysis`（当前主线已切到此正式契约）

当前主线 GPS 高阶分析补充：

- 当前返回已不只包含：
  - `ceemd`
  - `prediction.shortTerm/longTerm`
- 还包含：
  - `trendDiagnostics`
  - `prediction.thresholdForecast`
  - `prediction.confidenceIntervals`
- 其中当前 `trendDiagnostics` 已补：
  - `durationHours`
  - `regressionFitR2`
- 当前 `thresholdForecast` 已补：
  - `etaHours`
  - `etaDays`
  - `firstTimestamp`
- 当前导出链也已同步消费这些字段：
  - `desk-gps-analysis.json`
  - `desk-gps-report.txt`

### baselines

- `GET {baseUrl}/api/baselines` → `Baseline[]`
- `PUT {baseUrl}/api/baselines/{deviceId}` body：`Baseline`（部分字段可缺省）→ `Baseline`
- `DELETE {baseUrl}/api/baselines/{deviceId}` → `void`
- `POST {baseUrl}/api/baselines/{deviceId}/auto-establish` body：`{}` → `Baseline`

当前主线 Desk 数据层补充：

- `baselines.upsert()` / `baselines.autoEstablish()` 已支持可选 `persist`
- 默认仍为真实写入
- proof 场景可使用 `persist=false` 做 non-mutating 验证

### system

- `GET {baseUrl}/api/v1/system/status` → `SuccessResponse<SystemStatusHealthSummary>`

说明：

- 当前主线 `apps/desk` 已改为优先消费 v1 `system/status`
- 页面仍保持旧 `SystemStatus` 结构，由 mapper 将健康摘要映射到当前页面模型

## 3) 与 OpenAPI(/api/v1) 的主要差异

### 3.1 路径与模块归属

- `GET /api/dashboard/summary`（desk） vs `GET /api/v1/dashboard`（OpenAPI）
- `GET /api/dashboard/weekly-trend`（desk） vs `GET /api/v1/dashboard/weekly-trend`（OpenAPI）
- `GET /api/system/status`（desk） vs `GET /api/v1/system/status`（OpenAPI）
- `GET /api/baselines*`（desk） vs `GET|PUT|DELETE /api/v1/gps/baselines*`（OpenAPI）
- `GET /api/gps-deformation/{deviceId}`（desk） vs `GET /api/v1/gps/deformations/{deviceId}/series`（OpenAPI，见 `docs/integrations/api/09-gps-deformations.md`）

### 3.2 响应包裹（SuccessResponse）

OpenAPI 统一响应格式包含 `code/message/timestamp/traceId/data`（见 `docs/integrations/api/api-design.md`）。
当前 desk `httpClient.fetchJson()` 直接返回 JSON 本体，不会自动解包 `data`：

- 若后端按 OpenAPI 返回，需要：`fetchJson()` 解包 `data`（并在错误分支解析 `message/traceId`）。
- 或者后端提供兼容的“直出”端点（继续走 `/api/*`）。

当前后端兼容策略：

- `/api/dashboard/summary`
- `/api/dashboard/weekly-trend`
- `/api/monitoring-stations`
- `/api/devices`
- `/api/system/status`

仍提供直出 JSON，便于 legacy 验证脚本与尚未迁移的消费侧继续联调。

### 3.3 GPS 数据形态

desk 的 `GpsSeries` 是简化模型（`points: {ts, dispMm}[]`）。
OpenAPI 的 GPS 形变序列是基于 baseline + 经纬度的聚合结果（水平/垂直/三维位移），对接时需要：

- 在 desk 侧增加转换层（从 OpenAPI points 计算/映射成 `dispMm`），或
- 升级 desk 侧模型与图表逻辑（推荐，保留更多工程信息）。

当前主线补充：

- `GpsMonitoringPage` 已新增 `getDerivedAnalysis()` 消费链
- 当前主线已改为优先读取 `/api/v1/gps/deformations/{deviceId}/analysis` 返回的：
  - `ceemd`
  - `trendDiagnostics`
  - `prediction`
- 当前 `prediction` 下已进一步补：
  - `thresholdForecast`
  - `confidenceIntervals`
- 当前 CEEMD / prediction 页面展示与分析导出，已经开始优先消费这条后端分析结果链

## 4) 联调检查清单（桌面端）

- `/app/settings` 切换到 `http`，将 baseUrl 改为实际服务地址（示例：`http://localhost:8080`）
- 验证 token：HTTP 请求头是否携带 `Authorization`
- 若出现 “HTTP 401/403”：检查后端 RBAC 权限与 token 生成逻辑
- Postman 快速回归：`docs/tools/postman/README.md`

## 5) 待办（对接落地）

- auth：将 `auth.login/logout` 改为真实请求，对齐 `docs/integrations/api/01-auth.md`
- 统一：优先让 desk 切到 `/api/v1`，并将 `/api/*` 保留为兼容入口
- GPS：对齐 `docs/integrations/api/09-gps-deformations.md` 的数据形态与参数（start/end/interval 等）
- 当前阶段补充：
  - 主线 `apps/desk` 已具备使用当前后端真实返回形状的最小数据层

## 2026-03-17 补充

### devices

- `POST {baseUrl}/api/v1/devices/{deviceId}/commands` → 下发设备控制指令
- `GET {baseUrl}/api/v1/devices/{deviceId}/commands?page=1&pageSize=50` → 查询指令列表

当前主线 Desk 数据层补充：

- 设备管理页的控制历史已改为读取真实命令列表
- 设备控制动作下发后会刷新该列表