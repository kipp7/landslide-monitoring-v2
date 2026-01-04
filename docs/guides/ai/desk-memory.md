# Desk（桌面端）AI 记忆与工作记录

本文件用于沉淀 `apps/desk`（前端 UI）与 `apps/desk-win`（Win11 原生壳）在开发过程中形成的**关键约定、对接入口、常见坑与近期改动**，便于后续并行 AI/多人协作快速接手。

## 1. 项目约束（必须知道）

- `origin/main` 受保护：不能直接 push，必须通过 PR 合并（需要满足 required checks）。
- 当前策略：Mock 优先把 UI 做精致，HTTP 对接在后端稳定后逐步替换。

## 2. 关键入口

- Desk 前端：`apps/desk/`
- Win 桌面端壳（WPF + WebView2）：`apps/desk-win/`
- Desk API 对接契约：`docs/integrations/api/018-desk-desktop.md`

## 3. 本地启动（最常用）

### 3.1 Web 预览（开发 UI）

在 `apps/desk` 目录：

- `npm run dev`
- 打开：`http://localhost:5174/#/login`

常见坑：

- 在 `apps/desk` 目录不要用 `npm -w apps/desk ...`（会报 `No workspaces found`）；要么在仓库根目录用 `npm -w apps/desk run dev`，要么在 `apps/desk` 目录直接 `npm run dev`。

### 3.2 Windows 桌面端（加载 dev server）

在仓库根目录：

- `$env:DESK_DEV_SERVER_URL="http://localhost:5174/"; dotnet run --project .\\apps\\desk-win\\LandslideDesk.Win\\LandslideDesk.Win.csproj`

说明：

- 不设置 `DESK_DEV_SERVER_URL` 时会加载 `dotnet publish` 时复制到 `web/` 的静态资源（见 `apps/desk-win/LandslideDesk.Win/LandslideDesk.Win.csproj`）。

## 4. Desk 的数据源切换与存储

- 设置页：`#/app/settings`
- 数据源模式：Mock / HTTP（Zustand persist）
- 登录态：`desk_auth_v1`
- 设置项：`desk_settings_v1`
- 首页本地数据：
  - `desk.home.todos.v1`（待办）
  - `desk.home.pins.v1`（重点站点 pin）
  - `desk.home.announcements.v1` + `desk.home.announcements.read.v1.<userId>`（公告）

## 5. 深链（用于测试/演示）

- 设备管理页（可定位设备/站点）：
  - `#/app/device-management?tab=status&deviceId=<id>`
  - `#/app/device-management?tab=management&stationId=<id>`
- GPS 监测页（可定位设备）：
  - `#/app/gps-monitoring?deviceId=<id>&range=7d&autoRefresh=1`

## 6. UI/交互关键决策

- 数据大屏（`#/app/analysis`）为沉浸式页面：在 `AppShell` 中隐藏 HoverSidebar，避免图表被固定侧栏覆盖；跳转通过大屏顶部左右按钮完成。
- HoverSidebar 为固定悬浮菜单（`apps/desk/src/components/HoverSidebar.tsx`），普通页面通过 `.desk-page` 的左侧 padding 预留空间（见 `apps/desk/src/styles.css`）。

## 7. 近期改动（摘要）

- 首页补齐可处置模块：待办（勾选/重置/新建）、重点站点（pin/直达 GPS/站点管理）、系统公告（已读/发布/删除）。
- 设备管理与 GPS 页支持 query 深链定位（便于演示/测试）。
- Win 桌面端图标已迭代为“山体 + 监测点 + 雷达”风格（`apps/desk-win/LandslideDesk.Win/Assets/LandslideDesk.ico`）。

