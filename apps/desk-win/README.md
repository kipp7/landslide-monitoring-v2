---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/apps/desk-win/readme
---

## Windows 桌面端（WPF + WebView2）

此目录是 `apps/desk` 的 Windows 原生壳程序：使用 WPF + WebView2 加载前端页面。

### 开发模式（推荐）

1. 启动前端：
   - `npm -w apps/desk run dev`
2. 启动桌面端（指向 dev server）：
   - PowerShell（在仓库根目录执行）：
     - `$env:DESK_DEV_SERVER_URL="http://localhost:5174/"; dotnet run --project .\\apps\\desk-win\\LandslideDesk.Win\\LandslideDesk.Win.csproj`
   - PowerShell（当前目录为 `apps/desk-win` 时）：
     - `$env:DESK_DEV_SERVER_URL="http://localhost:5174/"; dotnet run --project .\\LandslideDesk.Win\\LandslideDesk.Win.csproj`

### 生产构建

1. 构建前端（生成 `apps/desk/dist`）：
   - `npm -w apps/desk run build`
2. 发布桌面端（会把 `apps/desk/dist` 复制到输出目录的 `web/`）：
   - 在仓库根目录执行：
     - `dotnet publish .\\apps\\desk-win\\LandslideDesk.Win\\LandslideDesk.Win.csproj -c Release -r win-x64`
   - 当前目录为 `apps/desk-win` 时：
     - `dotnet publish .\\LandslideDesk.Win\\LandslideDesk.Win.csproj -c Release -r win-x64`
3. 一键发布（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\publish-desk-win.ps1`
   - 默认输出目录：`artifacts/desk-win/win-x64`
   - 同时会写出：
     - `artifacts/desk-win/win-x64/desk-win-package-manifest.json`
     - `docs/unified/reports/desk-win-package-latest.json`
4. 发布包验证（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\verify-desk-win-package.ps1`
   - 会从发布目录直接拉起 `LandslideDesk.Win.exe`，确认包内 `web/` 资源可用，并自动关闭进程
   - 同时会写出：
     - `docs/unified/reports/desk-win-package-verify-latest.json`
5. 环境前置检查（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\check-desk-win-prerequisites.ps1`
   - 会检查：
     - `dotnet` 是否存在
     - `Microsoft.WindowsDesktop.App 8.x` 是否可用
     - WebView2 Runtime 是否已安装
     - 发布包 exe / `web/index.html` 是否存在
   - 同时会写出：
     - `docs/unified/reports/desk-win-prerequisites-latest.json`
6. API-only 边界检查（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\check-desk-api-boundary.ps1`
   - 会检查：
     - `apps/desk` 是否引入 PostgreSQL / ClickHouse / ORM / Supabase 等直连数据库依赖
     - `apps/desk-win` 是否引入数据库驱动包
     - `apps/desk` / `apps/desk-win` 源码中是否出现连接串、驱动符号或直接数据库引用
   - 同时会写出：
     - `docs/unified/reports/desk-api-boundary-latest.json`
7. 交付总验收（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\check-desk-win-delivery.ps1`
   - 会汇总：
     - 发布清单
     - 验包结果
     - 前置环境检查结果
     - API-only 边界检查结果
   - 同时会写出：
     - `docs/unified/reports/desk-win-delivery-latest.json`
8. 交付包归档（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\package-desk-win-delivery.ps1`
   - 会生成：
     - `artifacts/desk-win/delivery/<timestamp>/`
     - `artifacts/desk-win/delivery/<timestamp>.zip`
   - 包内会同时带上：
     - 发布包
     - 交付文档
     - 验包/前置检查/总验收报告
9. 一键跑完整交付流水线（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\prepare-desk-win-delivery.ps1`
   - 会顺序执行：
     - 发布
     - 验包
     - 前置检查
     - 总验收
     - 交付包归档
   - 同时会写出：
     - `docs/unified/reports/desk-win-delivery-pipeline-latest.json`
10. 交付包校验值（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\hash-desk-win-delivery.ps1`
   - 会生成：
     - `docs/unified/reports/desk-win-delivery-hash-latest.json`
   - 当前覆盖：
     - `LandslideDesk.Win.exe`
     - `web/index.html`
     - 最终 delivery zip
11. 启动最新发布包（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\start-desk-win-packaged.ps1`
   - 会直接从 `desk-win-package-latest.json` 指向的发布目录启动 `LandslideDesk.Win.exe`
   - 启动时会清除 `DESK_DEV_SERVER_URL`，确保优先使用包内 `web/`
12. 查看发布包运行态（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\show-desk-win-packaged-status.ps1`
   - 会写出：
     - `docs/unified/reports/desk-win-packaged-status-latest.json`
13. 停止发布包实例（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\stop-desk-win-packaged.ps1`
14. 发布说明生成（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\render-desk-win-release-notes.ps1`
   - 会写出：
     - `docs/unified/reports/desk-win-release-notes-latest.md`
15. 固定 latest 交付出口（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\promote-desk-win-delivery.ps1`
   - 会生成：
     - `artifacts/desk-win/latest/`
     - `artifacts/desk-win/latest.zip`
   - 同时会写出：
     - `docs/unified/reports/desk-win-delivery-promote-latest.json`
16. 交付索引（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\render-desk-win-delivery-index.ps1`
   - 会生成：
     - `docs/unified/reports/desk-win-delivery-index-latest.json`
     - `docs/unified/reports/desk-win-delivery-index-latest.md`
17. 写入构建元数据（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\stamp-desk-win-delivery.ps1`
   - 会生成：
     - `docs/unified/reports/desk-win-build-info-latest.json`
     - `artifacts/desk-win/win-x64/desk-win-build-info.json`
18. 交付包保留策略（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\prune-desk-win-deliveries.ps1`
   - 默认仅保留最近 `3` 份时间戳交付目录和 zip
   - 会写出：
     - `docs/unified/reports/desk-win-delivery-retention-latest.json`
19. fixed latest 交付出口验收（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\check-desk-win-latest-delivery.ps1`
   - 会写出：
     - `docs/unified/reports/desk-win-latest-delivery-latest.json`
20. 启动 fixed latest 包（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\start-desk-win-latest.ps1`
21. 验证 fixed latest 包可运行（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\verify-desk-win-latest-package.ps1`
   - 会写出：
     - `docs/unified/reports/desk-win-latest-package-verify-latest.json`
22. 生成 EXE 安装器（安装器支路，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\build-desk-win-installer.ps1`
   - 会生成：
     - `artifacts/desk-win/installer/LandslideDesk-Setup-win-x64-<sha>.exe`
     - `docs/unified/reports/desk-win-installer-latest.json`
   - 当前策略：
     - `.NET 8 WindowsDesktop Runtime` 由 `self-contained` 处理
     - `WebView2 Runtime` 由安装器内置 Bootstrapper 处理
23. 验证 EXE 安装器（推荐，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\verify-desk-win-installer.ps1`
   - 会执行：
     - 静默安装
     - 首次启动验证
     - 静默卸载
   - 会写出：
     - `docs/unified/reports/desk-win-installer-verify-latest.json`
24. 生成现代化安装器 MVP（实验支路，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\build-desk-win-modern-installer.ps1`
   - 会复用现有 Inno 安装器作为底层稳定安装器，并额外生成一层 WiX Burn bundle：
     - `artifacts/desk-win/modern-installer/LandslideDesk-Modern-Setup-win-x64-<sha>.exe`
     - `docs/unified/reports/desk-win-modern-installer-latest.json`
25. 验证现代化安装器 MVP（实验支路，在仓库根目录执行）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\verify-desk-win-modern-installer.ps1`
   - 会执行：
     - 现代化 bundle 静默安装
     - 首次启动验证
     - 现代化 bundle 静默卸载
   - 会写出：
     - `docs/unified/reports/desk-win-modern-installer-verify-latest.json`
26. 生成云端直连交付包（推荐在需要发给其他电脑联调时使用）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\prepare-desk-win-cloud-delivery.ps1`
   - 默认云端 API：`http://134.175.187.208:8080`
   - 会生成：
     - `artifacts/desk-win/latest-cloud/`
     - `artifacts/desk-win/latest-cloud.zip`
     - `docs/unified/reports/desk-win-cloud-delivery-latest.json`
   - 当前策略：
     - `.NET 8 WindowsDesktop Runtime` 由 self-contained 发布处理
     - `WebView2 Runtime` 由 `start-cloud.cmd` / 安装器 bootstrapper 检查并补齐

### 说明

- 桌面端优先加载 `DESK_DEV_SERVER_URL`；未设置时加载随应用输出的 `web/` 静态资源。
- 发布目录可放置 `desk-runtime.json` 覆盖运行配置；环境变量 `DESK_API_BASE_URL` 仍然具有最高优先级。
- 可选调试环境变量：
  - `DESK_WEBVIEW2_ARGS`：传给 WebView2/Edge 的 `AdditionalBrowserArguments`（高级用法）。
  - `DESK_WEBVIEW2_DISABLE_GPU=1`：禁用 GPU（仅用于排查兼容性问题，可能降低帧率）。
- 需要系统已安装 WebView2 Runtime（Win11 通常默认具备）。
  - 如果页面白屏或加载失败，可先用系统 Edge 打开 `edge://version` 检查 WebView2 Runtime 是否正常。
- 默认行为：最小化/点击关闭按钮会进入系统托盘；如需彻底退出请在托盘菜单选择“退出”。
- 当前正式客户端边界：`desk-win` 只能通过 API 读写业务数据，不能直连 `PostgreSQL` / `ClickHouse`。
