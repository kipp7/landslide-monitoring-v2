# Delta for Windows Desktop Distribution

## ADDED Requirements

### Requirement: MSIX Primary Distribution
桌面端 MUST 提供 MSIX 安装包作为主要交付形态，并保证安装/卸载/升级流程可重复、可验证。

#### Scenario: Install on a clean Win11 machine
- **WHEN** 用户在干净的 Windows 11 机器上安装 MSIX
- **THEN** 应用 MUST 可启动并正常加载内置前端资源

### Requirement: Build Artifact Integrity
发布产物 MUST 包含完整的前端静态资源，并可在无网络情况下打开主要页面（Mock-first）。

#### Scenario: Offline first launch
- **WHEN** 用户首次启动时无网络
- **THEN** 应用 MUST 仍可进入系统并渲染主要页面（使用本地资源 + Mock）

### Requirement: Version Visibility
桌面端 MUST 可让用户在 UI 中查看版本信息（版本号、构建时间、commit id）。

#### Scenario: About dialog shows version
- **WHEN** 用户打开“关于/诊断”
- **THEN** MUST 显示版本号与构建信息

### Requirement: Update Mechanism
桌面端 MUST 提供更新检查入口，并 SHOULD 支持自动更新；至少需要覆盖“检查更新/更新失败提示/回滚指引”。

#### Scenario: Check for updates
- **WHEN** 用户点击“检查更新”
- **THEN** 应用 SHOULD 能检测到新版本并提示更新

### Requirement: Code Signing
桌面端 MUST 支持签名（测试/生产），并在发布流程中明确签名步骤与证书管理方式。

#### Scenario: Signed build installs without warnings
- **WHEN** 使用生产证书签名发布
- **THEN** 安装过程 SHOULD 不出现不可信警告（在受信任证书链前提下）
