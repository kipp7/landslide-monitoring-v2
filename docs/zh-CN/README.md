# 文档总览

[English](../README.md) | 简体中文

这组文档保持紧凑、实用：说明桌面端产品架构、仓库维护范围、Windows 打包流程和贡献约定。

## 推荐阅读顺序

| 文档 | 用途 |
| --- | --- |
| [架构说明](ARCHITECTURE.md) | 运行边界、应用职责和打包流程。 |
| [项目范围](PROJECT_SCOPE.md) | 仓库支持范围、维护规则和当前不维护的产品面。 |
| [发布流程](RELEASE.md) | 本地构建、打包、验证和 GitHub Release 检查清单。 |
| [Desktop UI](../../apps/desktop-ui/README.md) | React/Vite UI 包职责和命令。 |
| [Windows Shell](../../apps/windows-shell/README.md) | WPF/WebView2 宿主职责和打包行为。 |
| [中文贡献指南](../../CONTRIBUTING.zh-CN.md) | 贡献流程、检查命令和项目约定。 |
| [维护者指南](MAINTAINERS.md) | 评审策略、依赖更新节奏和发布前检查。 |
| [安全策略](../../SECURITY.md) | 漏洞报告和凭据处理策略。 |

## 仓库约定

- 目录名应表达产品职责和运行边界。
- 生成产物放在 `artifacts/`，不要提交到 Git。
- 本地报告放在 `docs/reports/`，需要时重新生成。
- 面向用户的行为变化应同步更新中英文文档。
- 涉及可见界面的 Pull Request 应附截图或录屏。

## 当前维护范围

当前公开仓库维护：

- 桌面 UI 源码
- Windows 壳源码
- 安装器资源
- 桌面端打包和验证脚本
- 公开文档与项目治理文件

以下内容不属于当前维护范围：

- 后端服务
- 移动端
- Web Dashboard
- 生产部署基础设施
- 私有现场配置
- 内部日志、工作记录和本地环境文件
