# 桌面端（apps/desk）数据与 API 对接契约

本文件用于把 **桌面端 UI（`apps/desk`）当前用到的数据模型与接口调用** 固化为一份可测试、可落地的对接清单，方便后续：

- 用 Mock 数据做 UI 迭代不走样
- 联调 v2 API 时按清单逐项对齐
- 做回归/冒烟测试时有统一入口

> 现阶段以 Mock 优先完成 UI；后端稳定后再逐步切换到 HTTP 模式对接 v2 API。

## 1. 入口与代码位置

- 桌面端前端：`apps/desk/`
- Desk API Contract（TypeScript 类型/接口）：`apps/desk/src/api/client.ts`
- Provider（Mock/HTTP 切换）：`apps/desk/src/api/ApiProvider.tsx`
- Mock 实现：`apps/desk/src/api/mockClient.ts`
- HTTP 实现骨架（待对接 v2）：`apps/desk/src/api/httpClient.ts`
- 设置页（切换模式/参数）：`apps/desk/src/views/SettingsPage.tsx`

## 2. 运行模式（Mock / HTTP）

### 2.1 Mock 模式（默认）

- 由 `createMockClient()` 提供数据，适合 UI/交互开发与演示。
- 可通过设置页调整 Mock 延迟与失败注入（用于验证空/错/重试）。

### 2.2 HTTP 模式（预留）

目前 `createHttpClient()` 仅为骨架实现，真实对接建议按以下顺序做：

1) **统一解包 v2 响应包裹**：v2 API 规范要求响应包含 `success/code/message/data/timestamp/traceId`（见 `docs/integrations/api/api-design.md`）。
2) **映射 DTO**：桌面端 DTO 偏轻量（见第 3 节），对接时需要把 v2 DTO 映射到桌面端 DTO（或反向）。
3) **补齐分页/筛选**：若 v2 返回分页结构，需要解包为扁平数组，或扩展桌面端 Contract 支持分页。

## 3. 桌面端当前 DTO（用于 UI）

以 `apps/desk/src/api/client.ts` 为准。

### 3.1 Station（站点）

- `id/name/area`
- `risk: low|mid|high`
- `status: online|offline|warning`
- `lat/lng`
- `deviceCount`

### 3.2 Device（设备）

- `id/name`
- `stationId/stationName`
- `type: gnss|rain|tilt|temp_hum|camera`
- `status: online|offline|warning`
- `lastSeenAt`（RFC3339 字符串）

### 3.3 DashboardSummary（首页指标）

- `stationCount`
- `deviceOnlineCount`
- `alertCountToday`
- `systemHealthPercent`

### 3.4 WeeklyTrend（首页周趋势）

- `labels[]`
- `rainfallMm[]`
- `alertCount[]`

### 3.5 GPS 时序

- `GpsSeries { deviceId, deviceName, points: [{ ts, dispMm }] }`

> v2 的 GPS 形变返回是 `horizontalMeters/verticalMeters/distanceMeters`（见 `docs/integrations/api/09-gps-deformations.md`），桌面端当前以 `dispMm` 做 UI 展示；对接时可先做简化映射：`dispMm = distanceMeters * 1000`。

### 3.6 Baseline（基准点）

- `Baseline { deviceId, deviceName, baselineLat/baselineLng/baselineAlt?, establishedBy, establishedTime, status, notes? }`

> v2 baseline 模型为 `method/pointsCount/baseline{latitude/longitude/altitude/...}`（见 `docs/integrations/api/08-gps-baselines.md`），需要适配。

## 4. 桌面端 API 清单（按 domain）

桌面端统一通过 `useApi()` 调用（Mock/HTTP 都实现同一套接口）。

### 4.1 auth

- `auth.login({ username, password } | { mobile, code }) -> { token, user }`
- `auth.logout() -> void`

对接建议：

- v2 参考：`docs/integrations/api/01-auth.md`
- 桌面端 token 存储：`apps/desk/src/stores/authStore.ts`（key：`desk_auth_v1`）

### 4.2 dashboard

- `dashboard.getSummary() -> DashboardSummary`
- `dashboard.getWeeklyTrend() -> WeeklyTrend`

说明：

- v2 未强制规定 “dashboard 聚合” 端点；可选择：
  - 后端提供聚合接口（推荐），或
  - 前端通过 stations/devices/alerts 计算（不推荐长期使用）。

### 4.3 stations

- `stations.list() -> Station[]`

对接建议：

- v2 参考：`docs/integrations/api/04-stations.md`

### 4.4 devices

- `devices.list({ stationId? }) -> Device[]`

对接建议：

- v2 参考：`docs/integrations/api/03-devices.md`
- 若 v2 返回分页结构，建议桌面端侧先做解包映射为扁平数组。

### 4.5 gps

- `gps.getSeries({ deviceId, days? }) -> GpsSeries`

对接建议：

- v2 参考：`docs/integrations/api/09-gps-deformations.md`
- 桌面端 `days` 可映射为 `startTime/endTime`（并选择合适 `interval`）。

### 4.6 baselines

- `baselines.list() -> Baseline[]`
- `baselines.upsert(input) -> Baseline`
  - `input`：`Omit<Baseline, "deviceName" | "establishedTime"> & { establishedTime?: string }`
- `baselines.remove({ deviceId }) -> void`
- `baselines.autoEstablish({ deviceId }) -> Baseline`

对接建议：

- v2 参考：`docs/integrations/api/08-gps-baselines.md`
- 可短期走 legacy 兼容路径（见 `docs/integrations/api/014-legacy-device-management.md` 与 08 章说明）。

### 4.7 system

- `system.getStatus() -> { cpuPercent, memPercent, diskPercent }`

对接建议：

- v2 参考：`docs/integrations/api/07-system.md`

## 5. 前端联调与测试入口

### 5.1 路由深链（用于测试/演示）

- 设备管理页：
  - `#/app/device-management?tab=status&deviceId=<id>`
  - `#/app/device-management?tab=management&stationId=<id>`
  - `#/app/device-management?tab=baselines`
- GPS 监测页：
  - `#/app/gps-monitoring?deviceId=<id>&range=7d&autoRefresh=1`

### 5.2 本地持久化 keys（用于排查/重置）

- `desk_settings_v1`：API 模式/性能开关等
- `desk_auth_v1`：登录态 token/user
- `desk.station-management.v1`：站点管理本地 mock 数据（含自定义字段）
- `desk.gps.dataLimit.v1`：GPS 表格显示条数
- `desk.home.todos.v1`：首页我的待办/已完成
- `desk.home.pins.v1`：首页重点站点 pin
- `desk.home.announcements.v1`：首页公告（mock）
- `desk.home.announcements.read.v1.<userId>`：公告已读状态

## 6. 对接完成标准（建议）

当桌面端切换到 HTTP 模式时，至少满足：

- [ ] 首页（指标/异常/重点站点/公告/待办）不报错
- [ ] `#/app/device-management` 与 `#/app/gps-monitoring` 可通过深链定位到指定设备/站点
- [ ] GPS 曲线可展示真实位移（允许先用 `distanceMeters` 做简化映射）
- [ ] Baseline CRUD 与 auto-establish 可用（允许先对接 legacy 兼容路径）
- [ ] 关键接口错误有可读提示（401/500/timeout）

