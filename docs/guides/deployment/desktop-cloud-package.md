---
title: desktop-cloud-package
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/deployment/desktop-cloud-package
---

# Windows 桌面端云端直连包

## 目标

用于生成一份可复制到其他 Windows 电脑运行的桌面端交付包。该包默认直连云端后端：

- API：`http://134.175.187.208:8080`
- MQTT：`mqtt://134.175.187.208:1883`

桌面端业务数据只走 HTTP API；MQTT 主要用于 RK3568 / 边缘节点上云。

如果后续更换云服务器，优先读迁移清单：[cloud-server-migration-and-rk3568-public-access.md](/E:/学校/02%20项目/99%20山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/guides/deployment/cloud-server-migration-and-rk3568-public-access.md)。

## 生成命令

在仓库根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\prepare-desk-win-cloud-delivery.ps1
```

生成产物：

- `artifacts/desk-win/latest-cloud/`
- `artifacts/desk-win/latest-cloud.zip`
- `docs/unified/reports/desk-win-cloud-delivery-latest.json`

如果只想生成便携包、不编译安装器：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\prepare-desk-win-cloud-delivery.ps1 -SkipInstaller
```

如果要生成指向新服务器的云端包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\prepare-desk-win-cloud-delivery.ps1 `
  -CloudApiBaseUrl "http://新服务器IP:8080" `
  -CloudMqttUrl "mqtt://新服务器IP:1883"
```

注意：旧包里的 `package\desk-runtime.json` 如果仍指向旧服务器，复制到其他电脑后仍会继续连旧服务器。正式换服务器后必须重新打包，或显式用 `DESK_API_BASE_URL` 做临时覆盖。

## 运行配置

云端直连不是写死在主默认值里，而是由发布包内的配置文件控制：

```text
package\desk-runtime.json
```

关键字段：

```json
{
  "profile": "tencent-cloud-lightweight",
  "api": {
    "mode": "http",
    "baseUrl": "http://134.175.187.208:8080",
    "force": true
  }
}
```

`api.force=true` 表示即使目标电脑曾经保存过旧的本地接口地址，桌面端也会优先使用包内云端地址，避免交付电脑打开后仍连 `127.0.0.1` 或旧 RK3568 地址。

## 依赖处理

云端包采用 self-contained 发布：

- `.NET 8 WindowsDesktop Runtime`：随包内应用一起发布，目标电脑不需要单独安装。
- `WebView2 Runtime`：Windows 11 通常自带；若缺失，启动脚本和安装器会尝试通过 Microsoft WebView2 Bootstrapper 安装。

推荐交付方式：

- 便携运行：解压 `latest-cloud.zip` 后双击 `start-cloud.cmd`。
- 更稳妥安装：运行 `installer/` 目录下的云端安装器。
- 启动前检测：双击 `diagnose-cloud.cmd`，会检查 Windows x64、包内文件、WebView2 Runtime、云端 API health，并写出 `cloud-diagnostics.log`。
- 安装器排障：如果安装器双击后异常退出，运行 `install-cloud-with-log.cmd`，会写出 `cloud-installer.log`。

## 验收

解压后可运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\verify-cloud-package.ps1
```

验收点：

- 云端 `/health` 可访问。
- 桌面端完成 ready handshake。
- `runtime.log` 中注入的 API 地址为 `http://134.175.187.208:8080`。

## 目标电脑常见限制

- Windows SmartScreen 可能拦截未签名安装器，需要选择“更多信息 / 仍要运行”。
- PowerShell 执行策略或安全软件可能拦截 `.ps1`，此时优先使用安装器，或在 PowerShell 中手动执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\diagnose-cloud.ps1` 查看日志。
- 离线电脑无法自动下载 WebView2；包内已带 WebView2 Bootstrapper，但 Bootstrapper 本身仍需要访问 Microsoft 服务。
- 当前包面向 `win-x64`，不保证 Windows ARM 或 32 位 Windows 可运行。

## 注意

- 该包不会覆盖正式基线 `artifacts/desk-win/latest.zip`，避免把本地/现场联调默认值改乱。
- 若需要把云端包升级为正式交付基线，再显式把 `latest-cloud.zip` 复制或提升为 `latest.zip`。
