# Desk Frontend Specification (apps/desk)

## Purpose
`apps/desk` 是桌面端的 Web UI（可用浏览器预览，也可由 `apps/desk-win` 作为桌面软件加载）。

当前阶段以“可演示、可交付的 UI”为主：必须在 **Mock 数据**下跑通完整页面与核心交互，不被后端阻塞。

## Requirements

### Requirement: Mock-First Runtime
桌面端前端 MUST 默认在 Mock 模式下可用（即使后端 API 不可用，也能进入主要页面并展示完整布局与交互）。

#### Scenario: Backend unavailable
- **WHEN** 后端服务未启动或接口不可用
- **THEN** 前端 MUST 仍可进入系统并完成主要交互（使用 Mock 数据）

### Requirement: Desktop Host Compatibility
前端 MUST 能在浏览器与 WebView2 桌面壳中运行，不依赖浏览器特有扩展或外部插件。

#### Scenario: Running inside WebView2
- **WHEN** 前端运行在 WebView2 桌面壳中
- **THEN** 前端 MUST 正常渲染与导航，不出现空白页或致命报错

### Requirement: Product-Grade UI Baseline
前端 MUST 达到可交付的 B 端产品 UI 基线：
- 信息结构清晰、组件一致、暗色主题可读
- 关键数据组件（卡片/表格/图表）在暗色背景下对比度合格
- 页面之间的导航与返回路径明确

#### Scenario: Contrast on dark background
- **WHEN** 表格/标签/关键数字在暗色背景上渲染
- **THEN** 文字颜色 MUST 保持足够对比度，避免黑字叠深色背景

### Requirement: Core Pages Available
前端 MUST 提供并可进入以下核心页面（路由可调整但需保持可达）：
- 登录页
- 首页/概览
- 数据分析大屏（分析页）
- 设备管理中心（含监测站管理/设备状态等关键区域）
- GPS 监测（含地图、表格、趋势/对比等主要区域）
- 系统设置（含退出登录）

#### Scenario: Navigation works
- **WHEN** 用户从侧边栏或页面入口导航到上述页面
- **THEN** 页面 MUST 可正常进入并渲染完整内容

### Requirement: Logout Flow
前端 MUST 提供退出登录能力，并在退出后回到登录页。

#### Scenario: Logout success
- **WHEN** 用户在设置页执行“退出登录”
- **THEN** 前端 MUST 清理登录状态并跳转到登录页

### Requirement: No Emoji Policy
前端 MUST 遵循“禁止使用 emoji 表情”的交付要求（包括按钮、提示、空状态文案等）。

#### Scenario: UI copy review
- **WHEN** 新增或调整任何 UI 文案
- **THEN** MUST 不包含 emoji 表情字符

