## ADDED Requirements

### Requirement: Modern Installer Shell
桌面端安装器 MUST 支持一个现代化、品牌化、简约的安装器壳层，以替代仅通过欢迎图局部定制的视觉方式。

#### Scenario: Modern branded bootstrapper entry
- **WHEN** 用户启动现代化安装器
- **THEN** 安装入口 MUST 提供统一品牌化视觉，而不是只显示默认向导壳层加局部位图

### Requirement: Installer Compatibility Matrix
现代化安装器方案 MUST 明确兼容性矩阵，并以兼容性结论作为是否进入正式交付链的前置条件。

#### Scenario: Compatibility reviewed before promotion
- **WHEN** 现代化安装器准备接入正式交付链
- **THEN** 必须先明确 Windows 版本、权限、Runtime、离线场景、并存场景与卸载行为

### Requirement: Installer Reuse Of Existing Delivery Pipeline
现代化安装器 SHOULD 复用现有 `desk-win` 发布、Runtime 处理、验证与交付链路，以降低替换成本和回归风险。

#### Scenario: Reuse existing packaging chain
- **WHEN** 新安装器壳层实现 MVP
- **THEN** 它 SHOULD 继续接入现有 `self-contained` 发布产物、WebView2 处理和交付验证流程
