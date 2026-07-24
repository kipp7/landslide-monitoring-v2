# 发布流程

本文档说明公开仓库的本地验证和发布准备流程。任何二进制发布包都必须同时提供对应源码资产和逐文件校验清单；不能只上传 IMG、BIN、EXE 或安装包。

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

## 遥测链路压测

压测必须使用独立测试 UUID，脚本会拒绝 A/B/C 正式设备号：

```powershell
npm run stress:telemetry:test
npm run stress:telemetry:dry-run
```

连接生产 MQTT 前还必须显式提供测试设备号、速率和数量。完整链路结果需要同时核对 MQTT ACK、Kafka lag、ClickHouse 唯一序号和指标行数，不能只凭发布端成功判定通过。当前生产压测证据见 `docs/field-tests/telemetry-pipeline-stress-20260724.md`。

## 固件与硬件复核

- 确认 `firmware/rk2206-xl01/README.md`、`PINOUT.md` 和构建元数据匹配当前固件包。
- 确认 `hardware/carrier-board/README.md` 已列出当前公开交付资料。
- 打板前复核原理图、BOM、贴片方向和 Gerber 包。

## RK2206 固件与源码成对发布

`firmware/rk2206-xl01/` 已经采用 `config/app/drivers/main/tests/utils` 的标准分层，禁止为了发包复制出另一套长期维护源码。OpenHarmony `vendor` 目录只在构建或打包时由脚本生成。

统一入口会一次生成两个资产：

- `RK2206-*.zip`：A/B/C 的 IMG、BIN、loader 和校验清单。
- `OpenHarmony-Source-*.zip`：完整工程源码、可直接放入 OpenHarmony vendor 的目录副本、构建工具、测试、文档和逐文件 SHA-256。

示例：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\firmware\package-xl01-release.ps1 `
  -ReleaseTag "xls1-compact-broadcast-v2-20260724" `
  -FirmwareArtifactDirectory ".\artifacts\firmware\rk2206-xl01-compact-broadcast-v2" `
  -FirmwareMarker "fw-compact-broadcast-poll-v2-20260724" `
  -FirmwareAssetName "RK2206-Field-Nodes-ABC-XLS1-Compact-Broadcast-v2-20260724.zip" `
  -SourceAssetName "OpenHarmony-Source-XLS1-Compact-Broadcast-v2-20260724.zip"
```

只有两个 ZIP 都生成并通过清单复验后，才允许加 `-Upload` 上传。上传后必须执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\firmware\verify-release-source-assets.ps1 `
  -ReleaseTag "xls1-compact-broadcast-v2-20260724"
```

验收器要求固件 ZIP 和 OpenHarmony 源码 ZIP 同时存在、状态为 `uploaded`，并具有 GitHub 返回的 SHA-256。公开源码中的 `DEVICE_SECRET` 必须保持 `CHANGE_ME_DEVICE_SECRET`，不得包含 `.env`、私钥或服务器凭据。

## GitHub Release 检查清单

- `main` 分支 CI 通过。
- `npm audit` 为 0 个漏洞。
- 桌面端 lint/build 通过。
- 边缘端 build/lint 通过。
- Windows 壳 Release 构建通过。
- 桌面便携包已生成并验证。
- 固件和硬件 README 与发布包一致。
- 每个二进制资产都有对应的源码资产，且 `verify-release-source-assets.ps1` 通过。
- `CHANGELOG.md` 已更新。
- 没有提交生成产物、本地环境文件、凭据、私有端点或本地现场日志。
