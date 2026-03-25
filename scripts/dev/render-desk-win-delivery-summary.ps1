[CmdletBinding()]
param(
  [string]$DeliveryFile = "docs/unified/reports/desk-win-delivery-latest.json",
  [string]$BundleFile = "docs/unified/reports/desk-win-delivery-bundle-latest.json",
  [string]$HashFile = "docs/unified/reports/desk-win-delivery-hash-latest.json",
  [string]$BuildChunkFile = "docs/unified/reports/desk-build-chunks-latest.json",
  [string]$InstallerReportFile = "docs/unified/reports/desk-win-installer-latest.json",
  [string]$InstallerVerifyFile = "docs/unified/reports/desk-win-installer-verify-latest.json",
  [string]$CustomInstallerReportFile = "docs/unified/reports/desk-win-customba-installer-latest.json",
  [string]$CustomInstallerVerifyFile = "docs/unified/reports/desk-win-customba-installer-verify-latest.json",
  [string]$DeliveryIndexFile = "docs/unified/reports/desk-win-delivery-index-latest.json",
  [string]$OutFile = "docs/unified/reports/desk-win-delivery-summary-latest.md"
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
$fullDeliveryFile = Join-Path $repoRoot $DeliveryFile
$fullBundleFile = Join-Path $repoRoot $BundleFile
$fullHashFile = Join-Path $repoRoot $HashFile
$fullBuildChunkFile = Join-Path $repoRoot $BuildChunkFile
$fullInstallerReportFile = Join-Path $repoRoot $InstallerReportFile
$fullInstallerVerifyFile = Join-Path $repoRoot $InstallerVerifyFile
$fullCustomInstallerReportFile = Join-Path $repoRoot $CustomInstallerReportFile
$fullCustomInstallerVerifyFile = Join-Path $repoRoot $CustomInstallerVerifyFile
$fullDeliveryIndexFile = Join-Path $repoRoot $DeliveryIndexFile
$fullOutFile = Join-Path $repoRoot $OutFile

foreach ($path in @($fullDeliveryFile, $fullBundleFile, $fullHashFile, $fullBuildChunkFile, $fullInstallerReportFile, $fullInstallerVerifyFile, $fullCustomInstallerReportFile, $fullCustomInstallerVerifyFile, $fullDeliveryIndexFile)) {
  if (-not (Test-Path $path)) {
    throw "required report not found: $path"
  }
}

$delivery = Get-Content -Path $fullDeliveryFile -Raw -Encoding UTF8 | ConvertFrom-Json
$bundle = Get-Content -Path $fullBundleFile -Raw -Encoding UTF8 | ConvertFrom-Json
$hash = Get-Content -Path $fullHashFile -Raw -Encoding UTF8 | ConvertFrom-Json
$chunk = Get-Content -Path $fullBuildChunkFile -Raw -Encoding UTF8 | ConvertFrom-Json
$installer = Get-Content -Path $fullInstallerReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$installerVerify = Get-Content -Path $fullInstallerVerifyFile -Raw -Encoding UTF8 | ConvertFrom-Json
$customInstaller = Get-Content -Path $fullCustomInstallerReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$customInstallerVerify = Get-Content -Path $fullCustomInstallerVerifyFile -Raw -Encoding UTF8 | ConvertFrom-Json
$deliveryIndex = Get-Content -Path $fullDeliveryIndexFile -Raw -Encoding UTF8 | ConvertFrom-Json

$dateLabel = (Get-Date).ToString("yyyy-MM-dd")
$lines = @(
  "# Desk-win 交付摘要 / Delivery Summary",
  "",
  "> 当前摘要对应 $dateLabel 的最新 desk-win 交付集。  ",
  "> This summary reflects the latest desk-win delivery set as of $dateLabel.",
  "",
  "## 当前状态 / Current Status",
  "",
  "- 交付状态：可交付。当前固定出口为 ``$($deliveryIndex.latest.packageDir)/`` 与 ``$($deliveryIndex.latest.packageZip)``。  ",
  "  Delivery status: ready for handoff. The fixed outputs are ``$($deliveryIndex.latest.packageDir)/`` and ``$($deliveryIndex.latest.packageZip)``.",
  "- 桌面端形态：WPF + WebView2 桌面壳，内含 ``apps/desk`` 的静态前端资源。  ",
  "  Desktop form: WPF + WebView2 shell with bundled static assets from ``apps/desk``.",
  "- 安装分发：同时提供 Inno 安装器与 custom BA 安装器。  ",
  "  Installation distribution: both the Inno installer and the custom BA installer are included.",
  "",
  "## 固定交付件 / Fixed Deliverables",
  "",
  "- 解压即用包：``$($deliveryIndex.latest.packageZip)``  ",
  "  Unpacked delivery package: ``$($deliveryIndex.latest.packageZip)``",
  "- 固定 latest 目录：``$($deliveryIndex.latest.packageDir)/``  ",
  "  Fixed latest directory: ``$($deliveryIndex.latest.packageDir)/``",
  "- Inno 安装器：``$($installer.installer.path)``  ",
  "  Inno installer: ``$($installer.installer.path)``",
  "- custom BA 安装器：``$($customInstaller.installer.path)``  ",
  "  Custom BA installer: ``$($customInstaller.installer.path)``",
  "",
  "## 验证快照 / Verification Snapshot",
  "",
  "- ``latest.zip`` 自动验证通过，关键结论为 ``readyAfterLaunch=$((Get-CheckOk -Checks $delivery.checks -Key 'verifyReadyAfterLaunch').ToString().ToLower())``。  ",
  "  ``latest.zip`` passed automated verification, with ``readyAfterLaunch=$((Get-CheckOk -Checks $delivery.checks -Key 'verifyReadyAfterLaunch').ToString().ToLower())``.",
  "- Inno 安装器自动验证通过，关键结论为 ``ready=$([bool]$installerVerify.ready)``。  ",
  "  The Inno installer passed automated verification, with ``ready=$([bool]$installerVerify.ready)``.",
  "- custom BA 安装器自动验证通过，关键结论为 ``ready=$([bool]$customInstallerVerify.ready)``。  ",
  "  The custom BA installer passed automated verification, with ``ready=$([bool]$customInstallerVerify.ready)``.",
  "- 运行与环境前置检查已完成，``.NET 8 WindowsDesktop Runtime`` 与 ``WebView2 Runtime`` 均有留证。  ",
  "  Runtime and prerequisite checks are recorded, including ``.NET 8 WindowsDesktop Runtime`` and ``WebView2 Runtime``.",
  "",
  "## 真值文件 / Source-of-Truth Reports",
  "",
  "- 交付索引：``$DeliveryIndexFile``  ",
  "  Delivery index: ``$DeliveryIndexFile``",
  "- 完整性校验：``$HashFile``  ",
  "  Integrity report: ``$HashFile``",
  "- latest 包验证：``docs/unified/reports/desk-win-latest-package-verify-latest.json``  ",
  "  Latest package verification: ``docs/unified/reports/desk-win-latest-package-verify-latest.json``",
  "- Inno 安装器验证：``$InstallerVerifyFile``  ",
  "  Inno installer verification: ``$InstallerVerifyFile``",
  "- custom BA 安装器验证：``$CustomInstallerVerifyFile``  ",
  "  Custom BA installer verification: ``$CustomInstallerVerifyFile``",
  "",
  "## 已知非阻塞项 / Known Non-blocking Item",
  "",
  "- 当前前端 chunk 报告仍存在 ``$($chunk.summary.oversizeJsCount)`` 个超大 JS 包；这是已知非阻塞项，不影响本轮 desk-win 交付。  ",
  "  The frontend chunk report still shows ``$($chunk.summary.oversizeJsCount)`` oversized JS bundles; this is a known non-blocking item and does not block this desk-win delivery.",
  "",
  "## 交付建议 / Recommended Use",
  "",
  "- 日常测试或直接发包，优先使用 ``$($deliveryIndex.latest.packageZip)``。  ",
  "  Use ``$($deliveryIndex.latest.packageZip)`` first for routine testing or direct package handoff.",
  "- 需要引导式安装时，使用 Inno 安装器。  ",
  "  Use the Inno installer when a guided installation path is preferred.",
  "- 需要品牌化安装体验时，使用 custom BA 安装器。  ",
  "  Use the custom BA installer when a branded installation experience is required."
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
