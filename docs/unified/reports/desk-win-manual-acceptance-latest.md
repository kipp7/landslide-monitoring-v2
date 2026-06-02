# Desk-win 人工验收清单 / Manual Acceptance Checklist

> 目标：用人工视角复核当前 desk-win 交付件是否达到可交付状态。  
> Goal: use a manual reviewer workflow to confirm that the current desk-win package is truly handoff-ready.

## 验收对象 / Acceptance Targets

- `latest.zip`: `artifacts/desk-win/latest.zip`  
  `latest.zip`: `artifacts/desk-win/latest.zip`
- API-only 边界留证：`docs/unified/reports/desk-api-boundary-latest.json`  
  API-only boundary proof: `docs/unified/reports/desk-api-boundary-latest.json`
- Inno 安装器：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\installer\LandslideDesk-Setup-win-x64-628c350.exe`  
  Inno installer: `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\installer\LandslideDesk-Setup-win-x64-628c350.exe`
- custom BA 安装器：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\customba-installer\LandslideDesk-CustomBA-Setup-628c350-20260512-174022.exe`  
  Custom BA installer: `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\customba-installer\LandslideDesk-CustomBA-Setup-628c350-20260512-174022.exe`

## 验收项 0 / Check 0

### API-only 边界 / API-only boundary

- 操作：打开 `docs/unified/reports/desk-api-boundary-latest.json`，确认 `ready=true`。  
  Action: open `docs/unified/reports/desk-api-boundary-latest.json` and confirm that `ready=true`.
- 期望：`currentFormalClient` 固定为 `desk-win`。  
  Expected: `currentFormalClient` is fixed to `desk-win`.
- 期望：`allowedDataEntry` 固定为 `API-only`。  
  Expected: `allowedDataEntry` is fixed to `API-only`.
- 期望：客户端不直连 `PostgreSQL, ClickHouse`。  
  Expected: the client does not directly connect to `PostgreSQL, ClickHouse`.

## 验收项 1 / Check 1

### latest.zip 解压与启动 / latest.zip unpack and launch

- 操作：解压 `latest.zip`，启动 `LandslideDesk.Win.exe`。  
  Action: unpack `latest.zip` and launch `LandslideDesk.Win.exe`.
- 期望：压缩包可正常解压。  
  Expected: the archive can be unpacked successfully.
- 期望：程序启动后可进入可见 UI。  
  Expected: the application reaches a visible UI after launch.
- 自动留证：`docs/unified/reports/desk-win-latest-package-verify-latest.json`。  
  Automated evidence: `docs/unified/reports/desk-win-latest-package-verify-latest.json`.

## 验收项 2 / Check 2

### Inno 安装、启动、卸载 / Inno install, launch, and uninstall

- 操作：运行 Inno 安装器，完成安装后启动应用，再执行卸载。  
  Action: run the Inno installer, finish installation, launch the app, and then uninstall it.
- 期望：安装流程顺利完成。  
  Expected: the installation flow completes successfully.
- 期望：安装后的应用可进入可见 UI。  
  Expected: the installed app reaches a visible UI.
- 期望：卸载后安装文件被正常移除。  
  Expected: installed files are removed after uninstall.
- 自动留证：`docs/unified/reports/desk-win-installer-verify-latest.json`。  
  Automated evidence: `docs/unified/reports/desk-win-installer-verify-latest.json`.

## 验收项 3 / Check 3

### custom BA 安装、启动、卸载 / Custom BA install, launch, and uninstall

- 操作：运行 custom BA 安装器，完成引导安装后启动应用，再按其管理卸载路径执行卸载。  
  Action: run the custom BA installer, complete the guided install, launch the app, and then use its managed uninstall flow.
- 期望：引导安装流程顺利完成。  
  Expected: the guided installation completes successfully.
- 期望：安装后的应用可进入可见 UI。  
  Expected: the installed app reaches a visible UI.
- 期望：卸载后已记录版本被正确移除。  
  Expected: the recorded installed version is removed correctly after uninstall.
- 自动留证：`docs/unified/reports/desk-win-customba-installer-verify-latest.json`。  
  Automated evidence: `docs/unified/reports/desk-win-customba-installer-verify-latest.json`.

## 人工补充观察 / Additional Manual Observations

- 确认登录页、首页或任一主界面能稳定渲染。  
  Confirm that the login page, home page, or any main screen renders correctly.
- 确认交付给客户端的是 API 地址与客户端配置，而不是数据库账号或数据库连接串。  
  Confirm that the client handoff contains API endpoints and client configuration, not database credentials or direct connection strings.
- 确认关闭程序后不会残留异常前台窗口。  
  Confirm that no abnormal foreground window remains after closing the app.
- 若接收方使用品牌化安装流程，确认安装界面文案、图标和收口动作符合预期。  
  If the receiver uses the branded install flow, confirm that the installer text, icon, and closeout behavior match expectations.

## 判定标准 / Pass Criteria

- 三条路径至少有一条作为实际交付路径通过人工复核。  
  At least one of the three delivery paths must pass manual review as the actual handoff path.
- API-only 边界留证必须为 `ready=true`，且 `allowedDataEntry=API-only`。  
  The API-only boundary proof must report `ready=true` and `allowedDataEntry=API-only`.
- 对外主交付建议仍优先使用 `latest.zip` 或 Inno 安装器；custom BA 用于品牌化场景。  
  For external handoff, `latest.zip` or the Inno installer remains the preferred path; custom BA is for branded scenarios.
