# AI 工作记录（LAMv2 Desk）

目的：集中记录桌面端（`apps/desk` + `apps/desk-win`）的实现要点、对接点、已知问题与排查路径，便于联调、测试与交付。

## 快速入口

- 前端 UI：`apps/desk`
- Windows 壳（WPF + WebView2）：`apps/desk-win`

## 开发与运行

在仓库根目录：

- 安装依赖：`npm install`
- 启动前端：`npm run dev`（端口 5174）
- 启动桌面端（指向 dev server）：
  - `$env:DESK_DEV_SERVER_URL="http://localhost:5174/"; dotnet run --project .\apps\desk-win\LandslideDesk.Win\LandslideDesk.Win.csproj`

## 生产构建

- 构建前端：`npm run build`（生成 `apps/desk/dist`）
- 发布桌面端：`dotnet publish .\apps\desk-win\LandslideDesk.Win\LandslideDesk.Win.csproj -c Release -r win-x64`

## 当前特性概览

- UI 数据模式：Mock / HTTP 可切换（入口：`/app/settings`）
- 数据大屏：`/app/analysis` 采用沉浸模式（隐藏侧栏，避免遮挡图表）
- Windows：支持托盘驻留、全屏切换（F11 / ESC）
- 设备管理中心：支持 `tab=status|management|baselines`，并可通过 query 参数实现跨页联动（见 `docs/API_INTEGRATION.md`）
- 展厅演示仿真：Mock 模式下可配置场景/倍速/种子，并可重置基线与仿真时钟（入口：`/app/settings`）

## 已知问题（待办）

- 托盘弹窗定位在部分环境存在偏移：优先级降低，先推进业务 UI 与对接能力
- WebView2 首次启动帧率偏低：优先通过“减少动效/降低地形质量”规避，后续再做专项优化

## 已解决（排查记录）

- 页面右侧出现“空白边/预留条”，导致整体布局看起来靠左
  - 现象：在浏览器与桌面壳中都会出现，像是右侧被“撑出一条边界”
  - 根因：全局启用 `scrollbar-gutter: stable` 会为滚动条预留空间，部分环境下表现为始终占位
  - 修复：移除全局 `scrollbar-gutter: stable`（分支：`fix/layout-right-gap-20260108`，文件：`apps/desk/src/styles.css`）

