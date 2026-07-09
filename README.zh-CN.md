# 山体滑坡监测 V2

[![CI](https://github.com/kipp7/landslide-monitoring-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/kipp7/landslide-monitoring-v2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Windows](https://img.shields.io/badge/platform-Windows-0078D4.svg)](apps/windows-shell)
[![Edge](https://img.shields.io/badge/edge-RK3568-2E7D32.svg)](edge/rk3568-gateway)
[![Firmware](https://img.shields.io/badge/firmware-RK2206-7952B3.svg)](firmware/rk2206-xl01)
[![Hardware](https://img.shields.io/badge/hardware-carrier%20board-455A64.svg)](hardware/carrier-board)

[English](README.md) | 简体中文

山体滑坡监测 V2 是一个端到端开源山体滑坡监测系统。仓库同时包含 Windows 操作员客户端、RK3568 边缘网关服务、RK2206 现场节点固件，以及载板硬件交付资料。

仓库按系统的真实组成来组织：桌面端、边缘网关、现场固件和硬件资料分别放在清晰目录下，方便阅读、构建和维护。

## 系统概览

```text
RK2206 现场节点
  -> RK3568 边缘网关
    -> 兼容的监测 API / MQTT Broker
      -> Windows 桌面操作员客户端
```

## 项目亮点

- Windows 监测客户端基于 React、Vite、WPF 和 WebView2。
- RK3568 边缘服务覆盖串口遥测、MQTT 转发、本地健康摘要、监督服务和声光报警执行。
- RK2206 XL01 现场固件包覆盖传感采集、遥测封包、指令确认、看门狗和板级工具。
- 载板硬件交付包包含原理图、PCB 预览、Gerber、BOM、坐标文件和 LCEDA 源工程包。
- 提供中英文文档、Issue 模板、维护者说明、安全策略、CI 和 MIT License。

## 仓库结构

| 路径 | 职责 |
| --- | --- |
| `apps/desktop-ui/` | React + Vite 监测操作界面。 |
| `apps/windows-shell/` | WPF + WebView2 Windows 宿主、打包资源和启动检查。 |
| `edge/rk3568-gateway/` | RK3568 网关、链路监测、监督服务和声光报警执行服务。 |
| `firmware/rk2206-xl01/` | RK2206 XL01 现场节点固件包和引脚说明。 |
| `hardware/carrier-board/` | 载板公开设计和打板交付资料。 |
| `packages/` | 边缘服务共用的 TypeScript 包。 |
| `scripts/desktop/` | Windows 桌面端开发、打包和验证脚本。 |
| `docs/` | 架构、范围、发布、系统、维护和中英文文档。 |

## 当前维护面

| 维护面 | 状态 | 主要文档 |
| --- | --- | --- |
| Windows 桌面客户端 | 持续维护 | [Desktop UI](apps/desktop-ui/README.md)、[Windows Shell](apps/windows-shell/README.md) |
| RK3568 边缘网关 | 持续维护 | [边缘网关](edge/rk3568-gateway/README.md) |
| RK2206 现场固件 | 作为公开固件包维护 | [固件说明](firmware/rk2206-xl01/README.md) |
| 载板硬件交付资料 | 作为公开设计包维护 | [硬件说明](hardware/carrier-board/README.md) |
| Web / 移动端 / 后端基础设施 | 不包含在公开树中 | [项目范围](docs/zh-CN/PROJECT_SCOPE.md) |

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面 UI | React 18、TypeScript、Vite、Ant Design |
| 可视化 | ECharts、Leaflet、Three.js |
| 原生桌面壳 | .NET 8、WPF、WebView2 |
| 边缘服务 | Node.js 20、TypeScript、MQTT、serialport、systemd 部署模板 |
| 现场固件 | OpenHarmony/RK2206 应用包 |
| 硬件交付 | 原理图、PCB 预览、Gerber、BOM、坐标文件、LCEDA 工程包 |
| 工程化 | npm workspaces、ESLint、Prettier、GitHub Actions |

## 快速开始

```powershell
git clone https://github.com/kipp7/landslide-monitoring-v2.git
cd landslide-monitoring-v2
npm install
npm run dev
```

桌面 UI 开发服务器默认运行在 `http://localhost:5174/`。

启动 Windows 原生壳并连接开发服务器：

```powershell
npm run desktop:dev
```

## 构建与验证

桌面 UI：

```powershell
npm audit
npm run lint
npm run build
```

RK3568 边缘服务：

```powershell
npm run edge:build
npm run edge:lint
```

Windows 壳：

```powershell
dotnet build .\apps\windows-shell\LandslideDesk.Win\LandslideDesk.Win.csproj -c Release
```

生成默认 Windows 便携包：

```powershell
npm run desktop:publish
```

默认打包输出不提交到 Git：

- `artifacts/windows/portable/`
- `docs/reports/windows-package-latest.json`

## 文档

- [文档总览](docs/zh-CN/README.md)
- [系统概览](docs/zh-CN/system/OVERVIEW.md)
- [架构说明](docs/zh-CN/ARCHITECTURE.md)
- [项目范围](docs/zh-CN/PROJECT_SCOPE.md)
- [发布流程](docs/zh-CN/RELEASE.md)
- [英文文档总览](docs/README.md)
- [英文系统概览](docs/system/OVERVIEW.md)
- [英文架构说明](docs/ARCHITECTURE.md)
- [英文项目范围](docs/PROJECT_SCOPE.md)
- [英文发布流程](docs/RELEASE.md)

## 仓库范围

仓库包含公开源码、文档、示例、部署模板、RK2206 固件包和载板硬件交付资料。运行密钥、本地日志、生成产物和现场特定配置应保留在 Git 之外。

## 贡献

欢迎提交 Issue 和 Pull Request。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，涉及可见界面的改动请附截图或录屏。

## License

本项目使用 [MIT License](LICENSE) 开源。
