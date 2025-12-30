# Delta for Desk Frontend

## ADDED Requirements

### Requirement: Product Copy Baseline
前端 MUST 使用产品级文案（可交付/可宣传），避免“临时/开发态”口吻，并在关键页面保持一致。

#### Scenario: Login page copy
- **WHEN** 用户打开登录页
- **THEN** 页面标题与描述 MUST 清晰表达平台定位与价值

### Requirement: Consistent Dark Theme Contrast
前端 MUST 确保暗色主题下的对比度可读性（尤其是表格、标签、卡片上的文字）。

#### Scenario: Tag contrast
- **WHEN** Tag/Badge 在暗色背景上渲染
- **THEN** 文字颜色 MUST 与背景形成足够对比

### Requirement: Unified Empty/Loading/Error States
前端 MUST 为关键模块提供一致的加载/空/错误状态，并提供可操作的恢复路径（重试、去设置、去新增）。

#### Scenario: Empty list guidance
- **WHEN** 列表为空
- **THEN** MUST 展示空状态与可执行操作入口（例如“去添加监测站”）

### Requirement: Keyboard Usability
前端 MUST 提供基础键盘可用性（ESC 关闭、Enter 提交、常用快捷键），提升桌面端操作效率。

#### Scenario: ESC closes modal
- **WHEN** 用户打开弹窗
- **AND** 按下 ESC
- **THEN** 弹窗 SHOULD 关闭或触发取消操作

### Requirement: Desktop-Aware Actions
前端 MUST 能识别运行在桌面壳中，并在设置等合适位置展示与桌面相关的入口（如：退出软件、打开日志目录）。

#### Scenario: Desktop host detected
- **WHEN** 前端检测到桌面壳环境
- **THEN** 设置页 SHOULD 展示“退出软件”等原生入口
