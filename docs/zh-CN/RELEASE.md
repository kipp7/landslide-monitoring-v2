# 发布流程

本文档说明公开仓库的本地验证和发布准备流程。当前可发布产物是 Windows 桌面包；边缘服务、固件和硬件资料作为源码与交付包进行验证。

## 发布前检查

```powershell
npm install
npm audit
npm run lint
npm run build
npm run edge:build
npm run edge:lint
dotnet build .\apps\windows-shell\LandslideDesk.Win\LandslideDesk.Win.csproj -c Release
```

## 桌面便携包

```powershell
npm run desktop:publish
```

默认输出：

- `artifacts/windows/portable/`
- `docs/reports/windows-package-latest.json`

## 验证桌面包

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\desktop\verify-windows-package.ps1
```

## 可选：自包含包

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\desktop\package-windows-self-contained.ps1
```

默认输出：

- `artifacts/windows/self-contained/`
- `docs/reports/windows-self-contained-package-latest.json`

## 可选：安装器

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\desktop\build-windows-installer.ps1
```

安装器生成需要 Inno Setup 6。脚本会在需要时下载 WebView2 bootstrapper。

## 边缘服务源码验证

RK3568 边缘服务作为 workspace 包验证：

```powershell
npm run edge:build
npm run edge:lint
```

部署到真实 RK3568 板卡需要本地环境文件和现场特定值，这些内容不能提交。

## 固件与硬件复核

- 确认 `firmware/rk2206-xl01/README.md`、`PINOUT.md` 和构建元数据匹配当前固件包。
- 确认 `hardware/carrier-board/README.md` 已列出当前公开交付资料。
- 打板前复核原理图、BOM、贴片方向和 Gerber 包。

## GitHub Release 检查清单

- `main` 分支 CI 通过。
- `npm audit` 为 0 个漏洞。
- 桌面端 lint/build 通过。
- 边缘端 build/lint 通过。
- Windows 壳 Release 构建通过。
- 桌面便携包已生成并验证。
- 固件和硬件 README 与发布包一致。
- `CHANGELOG.md` 已更新。
- 没有提交生成产物、本地环境文件、凭据、私有端点或本地现场日志。
