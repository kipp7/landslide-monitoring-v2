# 架构说明

山体滑坡监测 V2 是一个公开的端到端监测系统工作区。仓库把桌面客户端、边缘网关、现场固件和载板硬件交付资料放在同一个可构建的公开树中。

## 系统边界

```text
现场层
  RK2206 XL01 固件
    -> 传感采集、遥测封包、指令确认

边缘层
  RK3568 网关服务
    -> 串口链路、MQTT 转发、健康摘要、监督服务、声光报警执行

操作层
  Windows 桌面客户端
    -> WPF + WebView2 宿主中的 React 监测界面
```

公开树包含源码、文档、示例、部署模板和硬件交付资料。运行密钥、本地日志、生成产物和现场特定配置应保留在 Git 之外。

## 应用与包

| 路径 | 职责 |
| --- | --- |
| `apps/desktop-ui` | React + Vite 监测界面，包括路由、状态、图表、地图和 mock 数据。 |
| `apps/windows-shell` | WPF/WebView2 原生宿主，包括启动检查、托盘能力和安装器资源。 |
| `edge/rk3568-gateway/field-gateway` | 串口到 MQTT 网关，负责本地缓存、健康输出、指令 ACK 和部署模板。 |
| `edge/rk3568-gateway/field-link-monitor` | 只读本地 sidecar，汇总现场链路健康状态。 |
| `edge/rk3568-gateway/hermes-edge-supervisor` | 本地监督服务，消费健康证据并输出操作员可读建议。 |
| `edge/rk3568-gateway/rk3568-alarm-actuator` | RK3568 声光报警执行服务。 |
| `firmware/rk2206-xl01` | 面向 OpenHarmony/RK2206 vendor 构建树的 RK2206 XL01 固件包。 |
| `hardware/carrier-board` | 载板原理图、PCB 预览、Gerber、BOM、坐标文件和 LCEDA 交付包。 |
| `packages/observability` | 边缘服务共用日志工具。 |
| `packages/validation` | 边缘载荷和配置共用校验工具。 |

## 桌面客户端

桌面客户端负责操作员直接使用的工作流：

- 首页总览和关键监测点状态。
- 设备管理和指令相关页面。
- GPS 形变和监测视图。
- 基于图表、地图、领域 mock 数据的分析页面。
- 账号、设置和系统状态页面。

开发时可以独立运行：

```powershell
npm run dev
```

原生壳有两种加载模式：

- 开发模式：读取 `DESK_DEV_SERVER_URL`，通常为 `http://localhost:5174/`。
- 打包模式：从发布目录中的 `web/` 静态资源加载界面。

## 边缘网关

RK3568 层负责连接现场设备和上游监测服务。公开服务按职责拆分：

- `field-gateway` 负责串口采集、消息重组、MQTT 上行、本地缓存、指令窗口和健康文件。
- `field-link-monitor` 读取本地状态文件并暴露只读监督摘要。
- `hermes-edge-supervisor` 将本地健康信号转为诊断和操作建议。
- `rk3568-alarm-actuator` 控制现场声光报警硬件，不接管遥测或网关主链路。

边缘服务是 TypeScript 包，可在仓库根目录验证：

```powershell
npm run edge:build
npm run edge:lint
```

## 现场固件

RK2206 XL01 固件包包含应用代码、配置、驱动、引脚说明和构建元数据。它用于集成到兼容的 OpenHarmony/RK2206 vendor 树，并使用 OpenHarmony/RK2206 构建流程。

## 硬件交付

载板目录包含公开设计和打板交付文件。这些文件可用于复核、复现和文档说明，但打板前仍需检查原理图、BOM、封装、方向和供应商替代料。

## 打包流程

1. 将 `apps/desktop-ui` 构建到 `apps/desktop-ui/dist`。
2. 使用 .NET 发布 `apps/windows-shell`。
3. 将静态 UI 构建结果复制到桌面包的 `web/` 目录。
4. 将本地打包报告写入 `docs/reports/`。
5. 生成输出保留在 Git 之外。

## 设计原则

- 公开模块应对应清晰的产品职责。
- 使用可读目录名，避免不清晰缩写。
- 生成产物、本地报告和机器状态保留在 Git 之外。
- 通过 mock 数据支持无后端 UI 开发。
- RK3568 服务保持可独立构建和 lint。
- 硬件资料作为可复核交付资产维护，打板前应结合所选供应商要求复核。
