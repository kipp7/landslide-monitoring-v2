---
title: spec
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-desk-win-installer-experience/specs/windows-desktop-distribution/spec
---

## ADDED Requirements

### Requirement: EXE Installer Distribution
桌面端 MUST 提供 EXE 安装器作为新增分发形态，并支持普通用户通过“下一步 -> 下一步 -> 完成”的方式完成安装。

#### Scenario: Install with wizard flow
- **WHEN** 用户启动 EXE 安装器
- **THEN** 安装流程 MUST 提供标准安装向导体验并完成应用安装

### Requirement: Self-contained Desktop Runtime
桌面端安装器 MUST 优先分发 self-contained 应用产物，以避免用户单独安装 `.NET 8 WindowsDesktop Runtime`。

#### Scenario: Install without desktop runtime preinstalled
- **WHEN** 目标机器未安装 `.NET 8 WindowsDesktop Runtime`
- **THEN** 应用 MUST 仍可在安装完成后启动

### Requirement: WebView2 Runtime Handling
桌面端安装器 MUST 检查 WebView2 Runtime；在缺失时 MUST 提供自动安装或明确引导。

#### Scenario: Install on a machine without WebView2
- **WHEN** 目标机器缺少 WebView2 Runtime
- **THEN** 安装器 MUST 完成 Runtime 安装或给出明确阻断提示与操作指引

### Requirement: Installer Shortcuts And Uninstall
桌面端安装器 MUST 创建开始菜单入口，并 MUST 提供卸载入口；桌面快捷方式 MAY 由用户选择。

#### Scenario: Installed app appears in system entry points
- **WHEN** 用户完成安装
- **THEN** 开始菜单与卸载入口 MUST 可用

### Requirement: Installer Post-install Launch
桌面端安装器 SHOULD 支持安装完成后立即启动应用。

#### Scenario: Launch after install
- **WHEN** 用户完成安装并勾选“立即启动”
- **THEN** 安装器 SHOULD 直接启动应用主程序