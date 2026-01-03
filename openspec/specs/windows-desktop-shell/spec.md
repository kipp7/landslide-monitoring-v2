# Windows Desktop Shell Specification (WPF + WebView2)

## Purpose
`apps/desk-win` 是 Windows 原生桌面“壳”，负责窗口管理、系统集成与基础诊断；业务 UI 由 `apps/desk`（Web）提供并运行在 WebView2 中。

## Requirements

### Requirement: Frontend Content Loading
桌面端 MUST 按如下优先级加载前端内容：
1) 环境变量 `DESK_DEV_SERVER_URL` 指向的开发服务器
2) 随桌面端发布到输出目录的 `web/` 静态资源（由 `apps/desk/dist` 复制而来）
3) 当以上两者均不可用时，显示“未找到前端资源”的启动提示页

#### Scenario: Dev server is configured
- **WHEN** `DESK_DEV_SERVER_URL` 被设置且非空
- **THEN** 桌面端 MUST 导航到该 URL

#### Scenario: Packaged web assets exist
- **WHEN** 未设置 `DESK_DEV_SERVER_URL`
- **AND** `web/index.html` 存在
- **THEN** 桌面端 MUST 从本地 `web/` 加载前端

#### Scenario: No assets available
- **WHEN** 未设置 `DESK_DEV_SERVER_URL`
- **AND** `web/index.html` 不存在
- **THEN** 桌面端 MUST 显示启动提示页并给出 dev/build 指引

### Requirement: WebView2 Production Hardening
桌面端 MUST 在生产环境关闭影响交付体验与安全性的 WebView2 能力（如：DevTools、默认右键菜单、状态栏、缩放控件等）。

#### Scenario: Debugger attached
- **WHEN** 桌面端在调试器附加（Debugger.IsAttached）下运行
- **THEN** 允许打开 DevTools，便于排障

#### Scenario: Production mode
- **WHEN** 桌面端未附加调试器
- **THEN** MUST 禁用 DevTools/默认右键菜单/缩放控件，并关闭状态栏

### Requirement: Fullscreen Toggle
桌面端 MUST 支持真全屏模式，并覆盖任务栏区域：
- `F11`：进入/退出全屏
- `ESC`：在全屏时退出全屏

#### Scenario: Toggle fullscreen
- **WHEN** 用户按下 `F11`
- **THEN** 桌面端 MUST 切换全屏状态

#### Scenario: Fullscreen covers taskbar
- **WHEN** 桌面端进入全屏
- **THEN** MUST 以显示器 `rcMonitor`（而非 `rcWork`）作为窗口边界，从而覆盖任务栏

### Requirement: Hotkey Scope
桌面端 SHOULD 仅在窗口处于激活状态时接管 `F11/ESC`，避免影响用户在其他应用中的按键使用。

#### Scenario: App deactivated
- **WHEN** 桌面端窗口失去焦点（Deactivated）
- **THEN** SHOULD 取消注册全屏热键

#### Scenario: App activated
- **WHEN** 桌面端窗口获得焦点（Activated）
- **THEN** SHOULD 注册全屏热键

### Requirement: Win11 Window Styling
桌面端 SHOULD 尽可能贴近 Windows 11 的原生视觉风格（深色标题栏、圆角、Mica/Backdrop 等），并在不支持时优雅降级。

#### Scenario: Windows 11 supported
- **WHEN** 系统版本满足 Windows 11（10.0.22000+）
- **THEN** SHOULD 尝试启用系统 Backdrop（Mica）

#### Scenario: Older Windows
- **WHEN** 系统不支持 Mica/Backdrop
- **THEN** MUST 不崩溃，并保持可用的深色窗口风格

### Requirement: Navigation Overlays
桌面端 MUST 提供启动/加载遮罩与失败提示 UI：
- 导航开始时展示“加载中”
- 导航成功后隐藏遮罩
- 导航失败时展示错误面板（重试/退出/必要时可切换到本地资源）

#### Scenario: Navigation success
- **WHEN** WebView2 导航成功完成
- **THEN** MUST 隐藏加载/错误遮罩

#### Scenario: Navigation failed
- **WHEN** WebView2 导航失败
- **THEN** MUST 展示错误面板，并提供“重新加载”操作

### Requirement: External Links
桌面端 MUST 拦截 WebView2 的新窗口请求，并用系统默认浏览器打开外部链接，避免弹出不可控的 WebView2 新窗口。

#### Scenario: New window request
- **WHEN** Web 内容触发 `window.open` 或新窗口导航
- **THEN** 桌面端 MUST 在系统浏览器中打开目标 URL

### Requirement: JS Host Bridge
桌面端 MUST 提供基础 JS Bridge，允许 Web UI 触发少量“原生动作”（如退出、全屏、最小化、打开外链）。

#### Scenario: Quit request from Web UI
- **WHEN** Web UI 发送 `{ "type": "app", "action": "quit" }`
- **THEN** 桌面端 MUST 退出进程

### Requirement: Single Instance
桌面端 MUST 保证单实例运行：当用户再次启动时，应激活已打开的实例并退出新进程。

#### Scenario: Second launch
- **WHEN** 已存在运行实例
- **THEN** 新进程 MUST 激活已有窗口并退出

### Requirement: Window Placement Persistence
桌面端 SHOULD 记住窗口位置与大小，并在下次启动时恢复；同时需要对多显示器/分辨率变化做边界保护。

#### Scenario: Restore on next start
- **WHEN** 用户调整窗口大小/位置后退出
- **THEN** 下次启动 SHOULD 恢复该窗口状态

### Requirement: Crash Logs
桌面端 MUST 捕获未处理异常并写入崩溃日志，便于现场定位问题。

#### Scenario: Unhandled exception
- **WHEN** 发生未处理异常
- **THEN** MUST 写入崩溃日志到本地目录（LocalAppData）

