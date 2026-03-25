# Desk-win 交付检查清单

## 1. 构建

- `npm -w apps/desk run build` 通过
- `dotnet build apps/desk-win/LandslideDesk.Win/LandslideDesk.Win.csproj` 通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/publish-desk-win.ps1` 通过

## 2. 发布包

- 发布目录已生成：`artifacts/desk-win/win-x64`
- `LandslideDesk.Win.exe` 存在
- `web/index.html` 存在
- `desk-win-package-manifest.json` 已生成

## 3. 验包

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/verify-desk-win-package.ps1` 通过
- `aliveAfterLaunch=true`
- `stoppedAfterVerify=true`

## 4. 运行体验

- 未设置 `DESK_DEV_SERVER_URL` 时可加载包内 `web/`
- 设置 `DESK_DEV_SERVER_URL` 时可加载 dev server
- 关闭窗口默认进入托盘
- 崩溃日志可写入本地 AppData

## 5. 交付说明

- `apps/desk-win/README.md` 已更新
- `docs/unified/reports/desk-win-env-matrix.md` 已提供环境配置矩阵
- 已知非阻塞项已单独记录，不混入启动失败问题

## 6. 当前已知非阻塞项

- `vite` chunk size warning 仍存在
- 包体积仍偏大，属于下一阶段性能优化项
