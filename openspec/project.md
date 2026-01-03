# Project Context

## Purpose
本仓库是“山体滑坡监测预警平台”的 v2 版本（`landslide-monitoring-v2`）。

当前阶段的主要目标：
- **先交付 Windows 11 桌面端**：用 `apps/desk`（Web UI）+ `apps/desk-win`（WPF + WebView2 壳）实现可演示、可落地的桌面软件体验。
- **Mock 优先**：在 v2 后端尚未稳定之前，桌面端 UI 必须可以完全使用 Mock 数据流畅运行；后续再逐步切换到 v2 API。
- **迁移参考区能力**：参考区仅用于对照功能与 UI（禁止修改），逐步把“前端效果 + 功能组件 + 业务流程”迁移到本仓库。

## Tech Stack
- Frontend（桌面 UI）：React + TypeScript + Vite + Ant Design（`apps/desk`）
- Desktop Shell：.NET 8 WPF + WebView2（`apps/desk-win`），加载 `apps/desk` 的 dev server 或内置静态资源
- Web（B 端管理/后台）：Next.js（`apps/web`）
- Backend：Node.js + TypeScript（`services/*`，Fastify 为主）
- Data：Postgres + ClickHouse（本地通过 Docker Compose 运行）

## Project Conventions

### Code Style
- 不做无关重构；尽量“小 PR、可回滚、可验证”
- TypeScript/React：优先可读性，避免一字母变量名；保持现有组件风格一致
- C#：遵循 .NET 命名与空安全（Nullable enable）
- 文案与 UI：**禁止使用 emoji 表情**

### Architecture Patterns
- 桌面端采用“壳 + Web UI”模式：WPF 负责窗口/系统集成，业务 UI 仍由 Web 实现
- 通过 JS Bridge 让 Web UI 触发部分“原生动作”（退出、全屏、打开外链等）
- Mock-first：任何页面默认不依赖后端即可进入并完成主要交互

### Testing Strategy
- 前端：`npm -w apps/desk run build`（至少保证可构建）
- 桌面端：`dotnet build apps/desk-win/LandslideDesk.Win/LandslideDesk.Win.csproj -c Release`
- 服务端：优先保证可启动与健康检查；逐步补齐单测/契约/集成验证

### Git Workflow
- `main` 受保护：**禁止直接 push main**，必须走分支 + PR + required checks
- 分支命名：`feat/<scope>/<desc>`、`fix/<scope>/<desc>`、`docs/<scope>/<desc>`
- 提交信息建议使用 Conventional Commits（如 `feat(desk-win): ...`）

## Domain Context
核心域对象：
- 监测站（Station）/ 设备（Device）/ 传感器（Sensor）
- GNSS（GPS）监测、雨量、温湿度、倾角、摄像头等
- 实时/历史数据、趋势分析、告警预警、设备在线状态与运维

## Important Constraints
- **参考区只读禁止修改**：`E:\\学校\\06 工作区\\2\\openharmony\\landslide-monitor\\landslide-monitor`
- Windows-only：当前只做 Win11 桌面端；其他平台不在范围
- Mock-first：UI 不允许被后端不稳定阻塞
- PR-only：遵循仓库 Rulesets/门禁；不要绕过流程

## External Dependencies
- WebView2 Runtime（Win11 通常已内置）
- Docker Desktop（本地跑 Postgres + ClickHouse）
- 外部设备/IoT 平台与消息系统（Kafka 等，按 v2 既有模块逐步对接）
