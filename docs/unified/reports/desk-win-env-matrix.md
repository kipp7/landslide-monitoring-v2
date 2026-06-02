---
title: desk-win-env-matrix
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/desk-win-env-matrix
---

# Desk-win 环境配置矩阵

## 1. 运行模式

### 开发模式

- 前端来源：`apps/desk` dev server
- 必需环境变量：
  - `DESK_DEV_SERVER_URL=http://localhost:5174/`
- 启动方式：
  - `npm -w apps/desk run dev`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/start-local-desk-win.ps1`

### 发布模式

- 前端来源：发布包内 `web/` 静态资源
- 必需环境变量：
  - 无
- 启动方式：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/publish-desk-win.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/verify-desk-win-package.ps1`

## 2. 可选环境变量

| 变量 | 用途 | 是否必需 | 说明 |
| --- | --- | --- | --- |
| `DESK_DEV_SERVER_URL` | 指向前端 dev server | 开发模式必需 | 未设置时桌面端会回退到包内 `web/` |
| `DESK_WEBVIEW2_ARGS` | 传给 WebView2 的额外启动参数 | 否 | 仅用于高级调试 |
| `DESK_WEBVIEW2_DISABLE_GPU` | 禁用 GPU | 否 | 仅排查兼容性问题时使用 |

## 3. 系统前置条件

- Windows 11
- 已安装 .NET 8 Runtime / SDK（开发机）
- 已安装 WebView2 Runtime

## 4. 发布产物要求

- 输出目录：`artifacts/desk-win/win-x64`
- 必须存在：
  - `LandslideDesk.Win.exe`
  - `web/index.html`
  - `desk-win-package-manifest.json`

## 5. 当前验证入口

- 打包：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/publish-desk-win.ps1`
- 验包：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/verify-desk-win-package.ps1`
- 报告：
  - `docs/unified/reports/desk-win-package-latest.json`
  - `docs/unified/reports/desk-win-package-verify-latest.json`