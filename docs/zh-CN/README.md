# 文档总览

[English](../README.md) | 简体中文

这组文档保持小而清晰：说明公开仓库的端到端系统边界、各维护面的职责、本地验证命令、发布流程和贡献约定。

## 推荐阅读顺序

| 文档 | 用途 |
| --- | --- |
| [系统概览](system/OVERVIEW.md) | 端到端产品面和数据流。 |
| [架构说明](ARCHITECTURE.md) | 运行边界、模块职责和打包流程。 |
| [项目范围](PROJECT_SCOPE.md) | 公开仓库边界、当前维护面和非目标。 |
| [发布流程](RELEASE.md) | 本地构建、验证、打包和 GitHub Release 检查清单。 |
| [Desktop UI](../../apps/desktop-ui/README.md) | React/Vite UI 包职责和命令。 |
| [Windows Shell](../../apps/windows-shell/README.md) | WPF/WebView2 宿主职责和打包行为。 |
| [RK3568 Edge Gateway](../../edge/rk3568-gateway/README.md) | 边缘服务职责、部署边界和公开安全说明。 |
| [RK2206 Firmware](../../firmware/rk2206-xl01/README.md) | 现场节点固件包和构建上下文。 |
| [Carrier Board](../../hardware/carrier-board/README.md) | 硬件设计和打板交付资料。 |
| [中文贡献指南](../../CONTRIBUTING.zh-CN.md) | 贡献流程、检查命令和项目约定。 |
| [维护者指南](MAINTAINERS.md) | 评审策略、依赖更新节奏和发布前检查。 |
| [安全策略](../../SECURITY.md) | 漏洞报告和凭据处理策略。 |

## 仓库约定

- 目录名表达产品职责和运行归属。
- 生成产物放在 `artifacts/`，不要提交到 Git。
- 本地报告放在 `docs/reports/`，需要时重新生成。
- 面向用户的行为变化应同步更新中英文文档。
- 涉及可见界面的 Pull Request 应附截图或录屏。
- 硬件文件作为工程交付资料维护，打板前仍需复核。

## 当前维护范围

当前公开仓库维护：

- Windows 桌面 UI 和原生壳源码。
- RK3568 边缘网关服务和部署模板。
- RK2206 XL01 现场固件包。
- 载板硬件设计和打板交付资料。
- 桌面端打包和验证脚本。
- 公开文档与 GitHub 项目治理文件。

以下内容不属于当前公开范围：

- 生产后端服务。
- 移动端应用。
- Web Dashboard 应用代码。
- 生产部署基础设施。
- 私有现场配置和客户特定点位数据。
- 内部日志、工作记录、本地证据包和本地环境文件。
