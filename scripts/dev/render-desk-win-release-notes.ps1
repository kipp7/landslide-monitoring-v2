[CmdletBinding()]
param(
  [string]$DeliveryCheckFile = "docs/unified/reports/desk-win-delivery-latest.json",
  [string]$DeliveryBundleFile = "docs/unified/reports/desk-win-delivery-bundle-latest.json",
  [string]$DeliveryHashFile = "docs/unified/reports/desk-win-delivery-hash-latest.json",
  [string]$DeliveryIndexFile = "docs/unified/reports/desk-win-delivery-index-latest.json",
  [string]$BuildChunkFile = "docs/unified/reports/desk-build-chunks-latest.json",
  [string]$BoundaryReportFile = "docs/unified/reports/desk-api-boundary-latest.json",
  [string]$InstallerReportFile = "docs/unified/reports/desk-win-installer-latest.json",
  [string]$InstallerVerifyFile = "docs/unified/reports/desk-win-installer-verify-latest.json",
  [string]$CustomInstallerReportFile = "docs/unified/reports/desk-win-customba-installer-latest.json",
  [string]$CustomInstallerVerifyFile = "docs/unified/reports/desk-win-customba-installer-verify-latest.json",
  [string]$OutFile = "docs/unified/reports/desk-win-release-notes-latest.md"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-CheckOk {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Checks,
    [Parameter(Mandatory = $true)]
    [string]$Key
  )

  $item = $Checks | Where-Object { $_.key -eq $Key } | Select-Object -First 1
  if ($null -eq $item) {
    return $false
  }

  return [bool]$item.ok
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullDeliveryCheckFile = Join-Path $repoRoot $DeliveryCheckFile
$fullBundleFile = Join-Path $repoRoot $DeliveryBundleFile
$fullHashFile = Join-Path $repoRoot $DeliveryHashFile
$fullDeliveryIndexFile = Join-Path $repoRoot $DeliveryIndexFile
$fullBuildChunkFile = Join-Path $repoRoot $BuildChunkFile
$fullBoundaryReportFile = Join-Path $repoRoot $BoundaryReportFile
$fullInstallerReportFile = Join-Path $repoRoot $InstallerReportFile
$fullInstallerVerifyFile = Join-Path $repoRoot $InstallerVerifyFile
$fullCustomInstallerReportFile = Join-Path $repoRoot $CustomInstallerReportFile
$fullCustomInstallerVerifyFile = Join-Path $repoRoot $CustomInstallerVerifyFile
$fullOutFile = Join-Path $repoRoot $OutFile

foreach ($path in @($fullDeliveryCheckFile, $fullBundleFile, $fullHashFile, $fullDeliveryIndexFile, $fullBuildChunkFile, $fullBoundaryReportFile, $fullInstallerReportFile, $fullInstallerVerifyFile, $fullCustomInstallerReportFile, $fullCustomInstallerVerifyFile)) {
  if (-not (Test-Path $path)) {
    throw "required report not found: $path"
  }
}

$delivery = Get-Content -Path $fullDeliveryCheckFile -Raw -Encoding UTF8 | ConvertFrom-Json
$bundle = Get-Content -Path $fullBundleFile -Raw -Encoding UTF8 | ConvertFrom-Json
$hash = Get-Content -Path $fullHashFile -Raw -Encoding UTF8 | ConvertFrom-Json
$deliveryIndex = Get-Content -Path $fullDeliveryIndexFile -Raw -Encoding UTF8 | ConvertFrom-Json
$chunk = Get-Content -Path $fullBuildChunkFile -Raw -Encoding UTF8 | ConvertFrom-Json
$boundary = Get-Content -Path $fullBoundaryReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$installer = Get-Content -Path $fullInstallerReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$installerVerify = Get-Content -Path $fullInstallerVerifyFile -Raw -Encoding UTF8 | ConvertFrom-Json
$customInstaller = Get-Content -Path $fullCustomInstallerReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$customInstallerVerify = Get-Content -Path $fullCustomInstallerVerifyFile -Raw -Encoding UTF8 | ConvertFrom-Json

$innoVerifyCn = if ([bool]$installerVerify.ready) {
  "Inno 安装器验证通过：``ready=true``。  "
} else {
  "Inno 安装器验证未通过：``ready=false``。  "
}
$innoVerifyEn = if ([bool]$installerVerify.ready) {
  "The Inno installer verification passed with ``ready=true``."
} else {
  "The Inno installer verification did not pass and currently reports ``ready=false``."
}
$customVerifyCn = if ([bool]$customInstallerVerify.ready) {
  "custom BA 安装器验证通过：``ready=true``。  "
} else {
  "custom BA 安装器验证未通过：``ready=false``。  "
}
$customVerifyEn = if ([bool]$customInstallerVerify.ready) {
  "The custom BA installer verification passed with ``ready=true``."
} else {
  "The custom BA installer verification did not pass and currently reports ``ready=false``."
}

$lines = @(
  "# Desk-win 发布说明 / Release Notes",
  "",
  "> 版本定位：本版为当前可交付的 desk-win 阶段性发布。  ",
  "> Release scope: this is the current handoff-ready desk-win release.",
  "",
  "## 本次发布包含 / This Release Includes",
  "",
  "- WPF + WebView2 桌面端外壳。  ",
  "  A WPF + WebView2 desktop shell.",
  "- 已打入包内的 ``apps/desk`` 静态前端资源。  ",
  "  Bundled static frontend assets from ``apps/desk``.",
  "- API-only 客户端边界留证，当前正式客户端固定为 ``$($boundary.boundary.currentFormalClient)``。  ",
  "  API-only client boundary proof with the current formal client fixed to ``$($boundary.boundary.currentFormalClient)``.",
  "- 固定 latest 出口、delivery bundle、Inno 安装器、custom BA 安装器。  ",
  "  Fixed latest outputs, a delivery bundle, an Inno installer, and a custom BA installer.",
  "- 交付摘要、交接说明、人工验收清单与验证报告。  ",
  "  A delivery summary, production handoff, manual acceptance checklist, and verification reports.",
  "",
  "## 本轮确认通过 / Confirmed in This Release",
  "",
  "- 解压包启动验证通过：``readyAfterLaunch=$((Get-CheckOk -Checks $delivery.checks -Key 'verifyReadyAfterLaunch').ToString().ToLower())``。  ",
  "  The unpacked package launch verification passed with ``readyAfterLaunch=$((Get-CheckOk -Checks $delivery.checks -Key 'verifyReadyAfterLaunch').ToString().ToLower())``.",
  "- $innoVerifyCn",
  "  $innoVerifyEn",
  "- $customVerifyCn",
  "  $customVerifyEn",
  "- API-only 边界验证通过：``ready=$($boundary.ready.ToString().ToLower())``，``allowedDataEntry=$($boundary.boundary.allowedDataEntry)``。  ",
  "  The API-only boundary validation passed with ``ready=$($boundary.ready.ToString().ToLower())`` and ``allowedDataEntry=$($boundary.boundary.allowedDataEntry)``.",
  "- 前置环境检查与交付总验收报告已生成。  ",
  "  Prerequisite checks and delivery acceptance reports have been generated.",
  "",
  "## 推荐交付组合 / Recommended Handoff Set",
  "",
  "- ``$($deliveryIndex.latest.packageZip)``  ",
  "  ``$($deliveryIndex.latest.packageZip)``",
  "- ``$($deliveryIndex.latest.packageDir)/``  ",
  "  ``$($deliveryIndex.latest.packageDir)/``",
  "- ``$($installer.installer.path)``  ",
  "  ``$($installer.installer.path)``",
  "- ``$($customInstaller.installer.path)``  ",
  "  ``$($customInstaller.installer.path)``",
  "",
  "## 推荐同时附带的文档 / Recommended Companion Documents",
  "",
  "- ``docs/unified/reports/desk-win-delivery-summary-latest.md``  ",
  "  ``docs/unified/reports/desk-win-delivery-summary-latest.md``",
  "- ``docs/unified/reports/desk-win-production-handoff-latest.md``  ",
  "  ``docs/unified/reports/desk-win-production-handoff-latest.md``",
  "- ``docs/unified/reports/desk-win-manual-acceptance-latest.md``  ",
  "  ``docs/unified/reports/desk-win-manual-acceptance-latest.md``",
  "- ``docs/unified/reports/desk-win-delivery-index-latest.json``  ",
  "  ``docs/unified/reports/desk-win-delivery-index-latest.json``",
  "- ``docs/unified/reports/desk-win-delivery-hash-latest.json``  ",
  "  ``docs/unified/reports/desk-win-delivery-hash-latest.json``",
  "",
  "## 已知非阻塞项 / Known Non-blocking Items",
  "",
  "- 当前 chunk 报告仍有 ``$($chunk.summary.oversizeJsCount)`` 个超大 JS 包，属于后续优化项，不影响本轮交付。  ",
  "  The current chunk report still contains ``$($chunk.summary.oversizeJsCount)`` oversized JS bundles. This remains a follow-up optimization item and does not block this release.",
  "- Docker 单机部署路径仍保留，但不替代本轮常规 desk-win 交付路径。  ",
  "  The Docker single-machine deployment path remains available, but it does not replace the standard desk-win delivery path for this release.",
  "- 未来 Web 只作为后续适配方向，不是当前正式交付端；后续页面能力必须复用同一 API-only 边界。  ",
  "  Future Web remains a later adaptation path rather than the current formal delivery client; future page capabilities must reuse the same API-only boundary.",
  "",
  "## 接收方建议 / Guidance for Receivers",
  "",
  "- 只需快速体验时，优先使用 ``$($deliveryIndex.latest.packageZip)``。  ",
  "  Use ``$($deliveryIndex.latest.packageZip)`` first when the receiver only needs a quick evaluation build.",
  "- 需要标准安装卸载流程时，使用 Inno 安装器。  ",
  "  Use the Inno installer when a standard install and uninstall flow is required.",
  "- 需要更完整品牌化安装体验时，使用 custom BA 安装器。  ",
  "  Use the custom BA installer when a more branded installation experience is required.",
  "- 不向客户端侧分发数据库连接串、数据库账号或直连数据库 SDK。  ",
  "  Do not distribute database connection strings, database credentials, or direct database SDKs to the client side.",
  "",
  "## 真值快照 / Source-of-Truth Snapshot",
  "",
  "- 当前 delivery bundle：``$($bundle.bundleZip)``  ",
  "  Current delivery bundle: ``$($bundle.bundleZip)``",
  "- API-only 边界留证：``$BoundaryReportFile``  ",
  "  API-only boundary proof: ``$BoundaryReportFile``",
  "- Exe SHA256：``$($hash.targets.exe.sha256)``  ",
  "  Exe SHA256: ``$($hash.targets.exe.sha256)``",
  "- WebIndex SHA256：``$($hash.targets.webIndex.sha256)``  ",
  "  WebIndex SHA256: ``$($hash.targets.webIndex.sha256)``",
  "- BundleZip SHA256：``$($hash.targets.bundleZip.sha256)``  ",
  "  BundleZip SHA256: ``$($hash.targets.bundleZip.sha256)``"
)

$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value ($lines -join [Environment]::NewLine) -Encoding UTF8

[pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  outFile = $OutFile
  ready = [bool]$delivery.ready
  bundleZip = $bundle.bundleZip
} | ConvertTo-Json -Depth 4
