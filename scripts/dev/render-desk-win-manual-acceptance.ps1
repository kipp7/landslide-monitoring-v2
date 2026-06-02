[CmdletBinding()]
param(
  [string]$DeliveryIndexFile = "docs/unified/reports/desk-win-delivery-index-latest.json",
  [string]$LatestVerifyFile = "docs/unified/reports/desk-win-latest-package-verify-latest.json",
  [string]$BoundaryReportFile = "docs/unified/reports/desk-api-boundary-latest.json",
  [string]$InstallerReportFile = "docs/unified/reports/desk-win-installer-latest.json",
  [string]$InstallerVerifyFile = "docs/unified/reports/desk-win-installer-verify-latest.json",
  [string]$CustomInstallerReportFile = "docs/unified/reports/desk-win-customba-installer-latest.json",
  [string]$CustomInstallerVerifyFile = "docs/unified/reports/desk-win-customba-installer-verify-latest.json",
  [string]$OutMdFile = "docs/unified/reports/desk-win-manual-acceptance-latest.md",
  [string]$OutJsonFile = "docs/unified/reports/desk-win-manual-acceptance-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullDeliveryIndexFile = Join-Path $repoRoot $DeliveryIndexFile
$fullLatestVerifyFile = Join-Path $repoRoot $LatestVerifyFile
$fullBoundaryReportFile = Join-Path $repoRoot $BoundaryReportFile
$fullInstallerReportFile = Join-Path $repoRoot $InstallerReportFile
$fullInstallerVerifyFile = Join-Path $repoRoot $InstallerVerifyFile
$fullCustomInstallerReportFile = Join-Path $repoRoot $CustomInstallerReportFile
$fullCustomInstallerVerifyFile = Join-Path $repoRoot $CustomInstallerVerifyFile
$fullOutMdFile = Join-Path $repoRoot $OutMdFile
$fullOutJsonFile = Join-Path $repoRoot $OutJsonFile

foreach ($path in @($fullDeliveryIndexFile, $fullLatestVerifyFile, $fullBoundaryReportFile, $fullInstallerReportFile, $fullInstallerVerifyFile, $fullCustomInstallerReportFile, $fullCustomInstallerVerifyFile)) {
  if (-not (Test-Path $path)) {
    throw "required file not found: $path"
  }
}

$deliveryIndex = Get-Content -Path $fullDeliveryIndexFile -Raw -Encoding UTF8 | ConvertFrom-Json
$latestVerify = Get-Content -Path $fullLatestVerifyFile -Raw -Encoding UTF8 | ConvertFrom-Json
$boundary = Get-Content -Path $fullBoundaryReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$installer = Get-Content -Path $fullInstallerReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$installerVerify = Get-Content -Path $fullInstallerVerifyFile -Raw -Encoding UTF8 | ConvertFrom-Json
$customInstaller = Get-Content -Path $fullCustomInstallerReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$customInstallerVerify = Get-Content -Path $fullCustomInstallerVerifyFile -Raw -Encoding UTF8 | ConvertFrom-Json

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  latestZip = $deliveryIndex.latest.packageZip
  boundaryReport = $BoundaryReportFile
  installerExe = $installer.installer.path
  customInstallerExe = $customInstaller.installer.path
  checks = @(
    [ordered]@{
      id = "api-boundary"
      title = "API-only boundary proof"
      target = $BoundaryReportFile
      expected = @(
        "Boundary report ready=true",
        "currentFormalClient=desk-win",
        "allowedDataEntry=API-only",
        "No direct PostgreSQL or ClickHouse access on the client"
      )
      automatedReference = [ordered]@{
        report = $BoundaryReportFile
        ready = [bool]$boundary.ready
        currentFormalClient = [string]$boundary.boundary.currentFormalClient
        allowedDataEntry = [string]$boundary.boundary.allowedDataEntry
        disallowedDirectStores = @($boundary.boundary.disallowedDirectStores)
      }
    }
    [ordered]@{
      id = "zip-open"
      title = "latest.zip unpack and launch"
      target = $deliveryIndex.latest.packageZip
      expected = @(
        "Archive can be unpacked successfully",
        "Application reaches visible UI after launch",
        "readyAfterLaunch=true in automated verification"
      )
      automatedReference = [ordered]@{
        report = $LatestVerifyFile
        aliveAfterLaunch = [bool]$latestVerify.aliveAfterLaunch
        readyAfterLaunch = [bool]$latestVerify.readyAfterLaunch
        stoppedAfterVerify = [bool]$latestVerify.stoppedAfterVerify
      }
    }
    [ordered]@{
      id = "inno-install"
      title = "Inno install, launch, uninstall"
      target = $installer.installer.path
      expected = @(
        "Installer completes successfully",
        "Installed app reaches visible UI",
        "Installed files are removed after uninstall"
      )
      automatedReference = [ordered]@{
        report = $InstallerVerifyFile
        installExitCode = $installerVerify.installExitCode
        aliveAfterLaunch = [bool]$installerVerify.aliveAfterLaunch
        readyAfterLaunch = [bool]$installerVerify.readyAfterLaunch
        uninstallExitCode = $installerVerify.uninstallExitCode
        ready = [bool]$installerVerify.ready
      }
    }
    [ordered]@{
      id = "customba-install"
      title = "Custom BA install, launch, uninstall"
      target = $customInstaller.installer.path
      expected = @(
        "Custom BA can complete guided install",
        "Installed app reaches visible UI",
        "Managed uninstall path removes the recorded version"
      )
      automatedReference = [ordered]@{
        report = $CustomInstallerVerifyFile
        installExitCode = $customInstallerVerify.installExitCode
        aliveAfterLaunch = [bool]$customInstallerVerify.aliveAfterLaunch
        readyAfterLaunch = [bool]$customInstallerVerify.readyAfterLaunch
        uninstallExitCode = $customInstallerVerify.uninstallExitCode
        ready = [bool]$customInstallerVerify.ready
      }
    }
  )
}

$jsonDir = Split-Path -Parent $fullOutJsonFile
if ($jsonDir -and -not (Test-Path $jsonDir)) {
  New-Item -ItemType Directory -Path $jsonDir -Force | Out-Null
}
Set-Content -Path $fullOutJsonFile -Value ($result | ConvertTo-Json -Depth 8) -Encoding UTF8

$mdLines = @(
  "# Desk-win 人工验收清单 / Manual Acceptance Checklist",
  "",
  "> 目标：用人工视角复核当前 desk-win 交付件是否达到可交付状态。  ",
  "> Goal: use a manual reviewer workflow to confirm that the current desk-win package is truly handoff-ready.",
  "",
  "## 验收对象 / Acceptance Targets",
  "",
  "- ``latest.zip``: ``$($result.latestZip)``  ",
  "  ``latest.zip``: ``$($result.latestZip)``",
  "- API-only 边界留证：``$($result.boundaryReport)``  ",
  "  API-only boundary proof: ``$($result.boundaryReport)``",
  "- Inno 安装器：``$($result.installerExe)``  ",
  "  Inno installer: ``$($result.installerExe)``",
  "- custom BA 安装器：``$($result.customInstallerExe)``  ",
  "  Custom BA installer: ``$($result.customInstallerExe)``",
  "",
  "## 验收项 0 / Check 0",
  "",
  "### API-only 边界 / API-only boundary",
  "",
  "- 操作：打开 ``$($result.boundaryReport)``，确认 ``ready=true``。  ",
  "  Action: open ``$($result.boundaryReport)`` and confirm that ``ready=true``.",
  "- 期望：``currentFormalClient`` 固定为 ``$($boundary.boundary.currentFormalClient)``。  ",
  "  Expected: ``currentFormalClient`` is fixed to ``$($boundary.boundary.currentFormalClient)``.",
  "- 期望：``allowedDataEntry`` 固定为 ``$($boundary.boundary.allowedDataEntry)``。  ",
  "  Expected: ``allowedDataEntry`` is fixed to ``$($boundary.boundary.allowedDataEntry)``.",
  "- 期望：客户端不直连 ``$($boundary.boundary.disallowedDirectStores -join ', ')``。  ",
  "  Expected: the client does not directly connect to ``$($boundary.boundary.disallowedDirectStores -join ', ')``.",
  "",
  "## 验收项 1 / Check 1",
  "",
  "### latest.zip 解压与启动 / latest.zip unpack and launch",
  "",
  "- 操作：解压 ``latest.zip``，启动 ``LandslideDesk.Win.exe``。  ",
  "  Action: unpack ``latest.zip`` and launch ``LandslideDesk.Win.exe``.",
  "- 期望：压缩包可正常解压。  ",
  "  Expected: the archive can be unpacked successfully.",
  "- 期望：程序启动后可进入可见 UI。  ",
  "  Expected: the application reaches a visible UI after launch.",
  "- 自动留证：``$LatestVerifyFile``。  ",
  "  Automated evidence: ``$LatestVerifyFile``.",
  "",
  "## 验收项 2 / Check 2",
  "",
  "### Inno 安装、启动、卸载 / Inno install, launch, and uninstall",
  "",
  "- 操作：运行 Inno 安装器，完成安装后启动应用，再执行卸载。  ",
  "  Action: run the Inno installer, finish installation, launch the app, and then uninstall it.",
  "- 期望：安装流程顺利完成。  ",
  "  Expected: the installation flow completes successfully.",
  "- 期望：安装后的应用可进入可见 UI。  ",
  "  Expected: the installed app reaches a visible UI.",
  "- 期望：卸载后安装文件被正常移除。  ",
  "  Expected: installed files are removed after uninstall.",
  "- 自动留证：``$InstallerVerifyFile``。  ",
  "  Automated evidence: ``$InstallerVerifyFile``.",
  "",
  "## 验收项 3 / Check 3",
  "",
  "### custom BA 安装、启动、卸载 / Custom BA install, launch, and uninstall",
  "",
  "- 操作：运行 custom BA 安装器，完成引导安装后启动应用，再按其管理卸载路径执行卸载。  ",
  "  Action: run the custom BA installer, complete the guided install, launch the app, and then use its managed uninstall flow.",
  "- 期望：引导安装流程顺利完成。  ",
  "  Expected: the guided installation completes successfully.",
  "- 期望：安装后的应用可进入可见 UI。  ",
  "  Expected: the installed app reaches a visible UI.",
  "- 期望：卸载后已记录版本被正确移除。  ",
  "  Expected: the recorded installed version is removed correctly after uninstall.",
  "- 自动留证：``$CustomInstallerVerifyFile``。  ",
  "  Automated evidence: ``$CustomInstallerVerifyFile``.",
  "",
  "## 人工补充观察 / Additional Manual Observations",
  "",
  "- 确认登录页、首页或任一主界面能稳定渲染。  ",
  "  Confirm that the login page, home page, or any main screen renders correctly.",
  "- 确认交付给客户端的是 API 地址与客户端配置，而不是数据库账号或数据库连接串。  ",
  "  Confirm that the client handoff contains API endpoints and client configuration, not database credentials or direct connection strings.",
  "- 确认关闭程序后不会残留异常前台窗口。  ",
  "  Confirm that no abnormal foreground window remains after closing the app.",
  "- 若接收方使用品牌化安装流程，确认安装界面文案、图标和收口动作符合预期。  ",
  "  If the receiver uses the branded install flow, confirm that the installer text, icon, and closeout behavior match expectations.",
  "",
  "## 判定标准 / Pass Criteria",
  "",
  "- 三条路径至少有一条作为实际交付路径通过人工复核。  ",
  "  At least one of the three delivery paths must pass manual review as the actual handoff path.",
  "- API-only 边界留证必须为 ``ready=true``，且 ``allowedDataEntry=API-only``。  ",
  "  The API-only boundary proof must report ``ready=true`` and ``allowedDataEntry=API-only``.",
  "- 对外主交付建议仍优先使用 ``latest.zip`` 或 Inno 安装器；custom BA 用于品牌化场景。  ",
  "  For external handoff, ``latest.zip`` or the Inno installer remains the preferred path; custom BA is for branded scenarios."
)

$mdDir = Split-Path -Parent $fullOutMdFile
if ($mdDir -and -not (Test-Path $mdDir)) {
  New-Item -ItemType Directory -Path $mdDir -Force | Out-Null
}
Set-Content -Path $fullOutMdFile -Value ($mdLines -join [Environment]::NewLine) -Encoding UTF8

$result | ConvertTo-Json -Depth 8
