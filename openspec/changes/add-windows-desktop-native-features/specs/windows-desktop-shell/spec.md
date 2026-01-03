# Delta for Windows Desktop Shell

## ADDED Requirements

### Requirement: System Tray Presence
桌面端 MUST 提供系统托盘图标，并支持最小化驻留与快捷操作。

#### Scenario: Tray menu provides core actions
- **WHEN** 用户右键托盘图标
- **THEN** MUST 显示菜单：打开主窗口、切换全屏、打开设置、退出

#### Scenario: Close to tray
- **WHEN** 用户点击窗口关闭按钮（可配置为“最小化到托盘”）
- **THEN** 应用 SHOULD 保持后台驻留，并可从托盘恢复

### Requirement: Native Toast Notifications
桌面端 MUST 支持 Windows 原生通知（Toast），用于展示告警与系统事件，并允许用户在设置中开启/关闭。

#### Scenario: Notify from Web UI
- **WHEN** Web UI 请求发送通知（例如告警触发）
- **THEN** 桌面端 SHOULD 弹出系统通知，并在点击后激活窗口

### Requirement: Optional Auto-Start
桌面端 MUST 提供“开机自启”开关能力，并在用户禁用时彻底移除自启配置。

#### Scenario: Toggle auto-start off
- **WHEN** 用户关闭“开机自启”
- **THEN** 桌面端 SHOULD 移除所有自启注册项/计划任务

### Requirement: Deep Link Protocol Handler
桌面端 MUST 支持 `landslide://` 协议，并将参数传递给前端用于路由跳转。

#### Scenario: Open route via protocol
- **WHEN** 用户打开 `landslide://route?path=/app/gps-monitoring`
- **THEN** 桌面端 SHOULD 激活应用并导航到对应路由

### Requirement: Native File Dialogs
桌面端 MUST 提供原生文件对话框能力（打开/保存），供前端进行导入导出或保存截图等。

#### Scenario: Export uses SaveFileDialog
- **WHEN** 前端请求导出文件
- **THEN** 桌面端 SHOULD 弹出 SaveFileDialog 并将用户选择的路径返回给前端

### Requirement: Diagnostics Bundle Export
桌面端 MUST 支持“一键导出诊断包”（日志、版本信息、关键配置），便于交付现场排障。

#### Scenario: Export diagnostics bundle
- **WHEN** 用户在设置/诊断入口触发“导出诊断包”
- **THEN** 桌面端 SHOULD 生成压缩包并提示保存位置
