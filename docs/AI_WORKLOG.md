# AI 工作记录（Desk 桌面端）

目的：把桌面端（`apps/desk` + `apps/desk-win`）相关的实现、对接点、已知问题集中记录，便于联调、测试、生产对接与后续任务拆解。

## 快速入口

- Web UI：`apps/desk`
- Win 壳：`apps/desk-win`
- 桌面端 API 对接映射：`docs/integrations/api/018-desk-ui.md`
- Postman 套件：`docs/tools/postman/README.md`
- 生产打包脚本：`scripts/release/package-brand.ps1`

## 近期变更（2026-01-05）

- `apps/desk/src/styles.css`：新增现代滚动条样式（WebView2/Chromium 生效）
- `apps/desk/src/api/httpClient.ts`：支持 OpenAPI `SuccessResponse.data` 自动解包，并修复“外部 AbortSignal + 超时”场景下的取消行为
- 数据大屏沉浸模式（`/app/analysis` 隐藏侧栏，避免遮挡图表）：分支 `fix/desk/analysis-immersive-20260105`（待合并）
- `apps/desk-win/LandslideDesk.Win`：托盘菜单改为 WPF “Flyout” 面板（替代 WinForms ContextMenuStrip），并增强全屏覆盖能力（减少任务栏露出概率）
- PR：仓库 main 分支受保护，需通过 PR 合并（示例：PR #308）

## 已知问题/风险

- `apps/desk` 构建产物体积较大（Vite build 有 chunk size 警告），后续可按页面/图表做代码分包
- Desk 的 `httpClient` 当前仍走 legacy `/api/*` 路径，生产对接前需要决定是否全面切到 `/api/v1` 并对齐路径/模型（见 `docs/integrations/api/018-desk-ui.md`）

## 后续建议

- 确认 desk 生产对接路线：全面切到 `/api/v1`（推荐）或继续使用 `/api/*` 兼容层
- 登录：接入真实登录与权限（RBAC）并打通退出登录/退出软件的行为一致性
- Windows 原生体验：窗口状态记忆、托盘交互细节（点击外部自动收起、定位更贴合任务栏区域）、启动性能与 WebView2 GPU 配置策略
