# Change: Modern Desktop Installer Shell

## Why

当前 `desk-win` 已经具备可交付的 EXE 安装器，但现有 Inno 向导主要解决“能安装、能卸载、能交付”，无法让整个安装器窗口形成足够现代、品牌化、简约的整体气质。

如果继续在 Inno 上只调整欢迎图和文案，视觉收益很有限；因此需要新增一条“现代化安装器壳层”方案，在不破坏现有交付链的前提下升级安装器整体体验。

## What Changes

- 为 Windows 安装器新增“现代化壳层”能力，目标是让安装入口、步骤页、完成页拥有统一品牌化视觉
- 优先评估 `WiX Burn + Bootstrapper UI` 这类更高自由度路线
- 保持现有核心安装逻辑复用：
  - `self-contained` 桌面端发布
  - WebView2 Runtime 检查与安装
  - per-user 安装策略
  - 快捷方式、卸载入口、安装后启动
  - 交付打包、latest 交付链、smoke 验证
- 在方案中补齐兼容性矩阵：
  - Windows 10/11 x64
  - 受限权限场景
  - 在线/离线 WebView2 场景
  - 安装器与 `latest` 便携包并存
  - 升级 / 回退 / 卸载
  - SmartScreen / 杀软 / 受限网络

## Non-Goals

- 不重做 Desk 业务 UI 或桌面主程序 UI
- 不替换当前已可用的 Inno 安装器作为短期交付路径
- 不在本变更中处理自动更新和代码签名正式接入

## Impact

- Affected specs: `windows-desktop-distribution`
- Affected code:
  - `apps/desk-win/installer/*`
  - `scripts/dev/build-desk-win-installer.ps1`
  - `scripts/dev/verify-desk-win-installer.ps1`
  - `scripts/dev/prepare-desk-win-delivery.ps1`
  - `docs/unified/reports/*`
  - 可能新增 `apps/desk-win/installer-modern/*` 或同类安装器工程目录
