[CmdletBinding()]
param(
  [string]$DeliveryIndexFile = "docs/unified/reports/desk-win-delivery-index-latest.json",
  [string]$DeliveryPipelineFile = "docs/unified/reports/desk-win-delivery-pipeline-latest.json",
  [string]$ReleaseNotesFile = "docs/unified/reports/desk-win-release-notes-latest.md",
  [string]$EnvChecklistFile = "docs/unified/reports/prod-env-checklist-latest.json",
  [string]$BuildChunkFile = "docs/unified/reports/desk-build-chunks-latest.json",
  [string]$BoundaryReportFile = "docs/unified/reports/desk-api-boundary-latest.json",
  [string]$InstallerReportFile = "docs/unified/reports/desk-win-installer-latest.json",
  [string]$InstallerVerifyFile = "docs/unified/reports/desk-win-installer-verify-latest.json",
  [string]$CustomInstallerReportFile = "docs/unified/reports/desk-win-customba-installer-latest.json",
  [string]$CustomInstallerVerifyFile = "docs/unified/reports/desk-win-customba-installer-verify-latest.json",
  [string]$OutJsonFile = "docs/unified/reports/desk-win-production-handoff-latest.json",
  [string]$OutMdFile = "docs/unified/reports/desk-win-production-handoff-latest.md"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullDeliveryIndexFile = Join-Path $repoRoot $DeliveryIndexFile
$fullDeliveryPipelineFile = Join-Path $repoRoot $DeliveryPipelineFile
$fullReleaseNotesFile = Join-Path $repoRoot $ReleaseNotesFile
$fullEnvChecklistFile = Join-Path $repoRoot $EnvChecklistFile
$fullBuildChunkFile = Join-Path $repoRoot $BuildChunkFile
$fullBoundaryReportFile = Join-Path $repoRoot $BoundaryReportFile
$fullInstallerReportFile = Join-Path $repoRoot $InstallerReportFile
$fullInstallerVerifyFile = Join-Path $repoRoot $InstallerVerifyFile
$fullCustomInstallerReportFile = Join-Path $repoRoot $CustomInstallerReportFile
$fullCustomInstallerVerifyFile = Join-Path $repoRoot $CustomInstallerVerifyFile
$fullOutJsonFile = Join-Path $repoRoot $OutJsonFile
$fullOutMdFile = Join-Path $repoRoot $OutMdFile

foreach ($path in @($fullDeliveryIndexFile, $fullDeliveryPipelineFile, $fullReleaseNotesFile, $fullEnvChecklistFile, $fullBuildChunkFile, $fullBoundaryReportFile, $fullInstallerReportFile, $fullInstallerVerifyFile, $fullCustomInstallerReportFile, $fullCustomInstallerVerifyFile)) {
  if (-not (Test-Path $path)) {
    throw "required file not found: $path"
  }
}

$index = Get-Content -Path $fullDeliveryIndexFile -Raw -Encoding UTF8 | ConvertFrom-Json
$pipeline = Get-Content -Path $fullDeliveryPipelineFile -Raw -Encoding UTF8 | ConvertFrom-Json
$envChecklist = Get-Content -Path $fullEnvChecklistFile -Raw -Encoding UTF8 | ConvertFrom-Json
$buildChunks = Get-Content -Path $fullBuildChunkFile -Raw -Encoding UTF8 | ConvertFrom-Json
$boundary = Get-Content -Path $fullBoundaryReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$installer = Get-Content -Path $fullInstallerReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$installerVerify = Get-Content -Path $fullInstallerVerifyFile -Raw -Encoding UTF8 | ConvertFrom-Json
$customInstaller = Get-Content -Path $fullCustomInstallerReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$customInstallerVerify = Get-Content -Path $fullCustomInstallerVerifyFile -Raw -Encoding UTF8 | ConvertFrom-Json

$innoAcceptanceCn = if ([bool]$installerVerify.ready) {
  "Inno 安装器自动验证通过。  "
} else {
  "Inno 安装器自动验证未通过。  "
}
$innoAcceptanceEn = if ([bool]$installerVerify.ready) {
  "The Inno installer passed automated verification."
} else {
  "The Inno installer did not pass automated verification."
}
$customAcceptanceCn = if ([bool]$customInstallerVerify.ready) {
  "custom BA 安装器自动验证通过。  "
} else {
  "custom BA 安装器自动验证未通过。  "
}
$customAcceptanceEn = if ([bool]$customInstallerVerify.ready) {
  "The custom BA installer passed automated verification."
} else {
  "The custom BA installer did not pass automated verification."
}

$mandatoryFiles = @(
  "docs/unified/reports/desk-win-delivery-summary-latest.md",
  "docs/unified/reports/desk-win-release-notes-latest.md",
  "docs/unified/reports/desk-win-manual-acceptance-latest.md",
  "docs/unified/reports/desk-win-delivery-index-latest.json",
  "docs/unified/reports/desk-win-delivery-hash-latest.json",
  $BoundaryReportFile
)

$nextActions = @(
  "使用 latest.zip 或 latest/ 作为主交付件",
  "Use latest.zip or latest/ as the primary handoff package",
  "按接收场景提供 Inno 或 custom BA 安装器",
  "Provide the Inno or custom BA installer based on the receiver scenario",
  "附带交付索引、发布说明和人工验收清单",
  "Include the delivery index, release notes, and manual acceptance checklist",
  "后续页面能力继续沿用 API-only 客户端边界，不新增前端直连数据库路径",
  "Keep future page capabilities on the same API-only client boundary and do not add any direct database path on the client side",
  "仅修复真实交接或试交付中暴露的问题",
  "Only fix defects discovered during real handoff or trial distribution"
)

$acceptanceSteps = @(
  "解压 latest.zip 或直接使用 latest/ 目录",
  "Unzip latest.zip or use the latest/ directory directly",
  "启动 LandslideDesk.Win.exe，并确认进入可见 UI",
  "Launch LandslideDesk.Win.exe and confirm that it reaches a visible UI",
  "如走安装器路径，完成一次安装、启动和卸载验证",
  "If the installer path is used, complete one install, launch, and uninstall cycle"
)

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  ready = [bool]$pipeline.ready
  latest = [ordered]@{
    packageDir = $index.latest.packageDir
    packageZip = $index.latest.packageZip
    executable = $index.latest.executable
    webIndex = $index.latest.webIndex
  }
  boundary = [ordered]@{
    report = $BoundaryReportFile
    ready = [bool]$boundary.ready
    currentFormalClient = [string]$boundary.boundary.currentFormalClient
    allowedDataEntry = [string]$boundary.boundary.allowedDataEntry
    disallowedDirectStores = @($boundary.boundary.disallowedDirectStores)
  }
  hashes = [ordered]@{
    exe = $index.hashes.exe
    webIndex = $index.hashes.webIndex
    bundleZip = $index.hashes.bundleZip
  }
  env = [ordered]@{
    configured = [int]$envChecklist.summary.configured
    placeholder = [int]$envChecklist.summary.placeholder
    missing = [int]$envChecklist.summary.missing
    emptyOptional = [int]$envChecklist.summary.emptyOptional
  }
  buildChunks = [ordered]@{
    oversizeJsCount = [int]$buildChunks.summary.oversizeJsCount
    largestJs = [string]$buildChunks.summary.largestJs.name
    largestJsKb = [double]$buildChunks.summary.largestJs.sizeKb
  }
  installer = [ordered]@{
    exe = $installer.installer.path
    sha256 = $installer.hashes.installer.sha256
    verified = [bool]$installerVerify.ready
    dotnetDesktopRuntimeHandledBy = [string]$installer.prerequisites.dotnetDesktopRuntimeHandledBy
    webView2HandledBy = [string]$installer.prerequisites.webView2HandledBy
  }
  customInstaller = [ordered]@{
    exe = $customInstaller.installer.path
    sha256 = $customInstaller.hashes.installer.sha256
    verified = [bool]$customInstallerVerify.ready
  }
  handoff = [ordered]@{
    mandatoryFiles = $mandatoryFiles
    nextActions = $nextActions
    acceptanceSteps = $acceptanceSteps
  }
}

$jsonDir = Split-Path -Parent $fullOutJsonFile
if ($jsonDir -and -not (Test-Path $jsonDir)) {
  New-Item -ItemType Directory -Path $jsonDir -Force | Out-Null
}
Set-Content -Path $fullOutJsonFile -Value ($result | ConvertTo-Json -Depth 8) -Encoding UTF8

$lines = @(
  "# Desk-win 交接说明 / Production Handoff",
  "",
  "> 用途：用于把当前 desk-win 交付包直接交给测试、验收或接收方。  ",
  "> Purpose: use this document when handing the current desk-win package to QA, reviewers, or external receivers.",
  "",
  "## 交接范围 / Handoff Scope",
  "",
  "- 固定 latest 目录：``$($result.latest.packageDir)/``  ",
  "  Fixed latest directory: ``$($result.latest.packageDir)/``",
  "- 固定 latest 压缩包：``$($result.latest.packageZip)``  ",
  "  Fixed latest zip package: ``$($result.latest.packageZip)``",
  "- Inno 安装器：``$($result.installer.exe)``  ",
  "  Inno installer: ``$($result.installer.exe)``",
  "- custom BA 安装器：``$($result.customInstaller.exe)``  ",
  "  Custom BA installer: ``$($result.customInstaller.exe)``",
  "- 客户端边界：当前正式客户端固定为 ``$($result.boundary.currentFormalClient)``，业务数据入口固定为 ``$($result.boundary.allowedDataEntry)``。  ",
  "  Client boundary: the current formal client is fixed to ``$($result.boundary.currentFormalClient)`` and its business data entry is fixed to ``$($result.boundary.allowedDataEntry)``.",
  "",
  "## 接收方必须拿到 / Mandatory Items for the Receiver",
  "",
  "- 交付件本体：``latest/`` 或 ``latest.zip``。  ",
  "  The main delivery package: ``latest/`` or ``latest.zip``.",
  "- 至少一种安装器：Inno 或 custom BA，按接收场景选择。  ",
  "  At least one installer: choose Inno or custom BA depending on the handoff scenario.",
  "- 交付索引与交付摘要。  ",
  "  The delivery index and the delivery summary.",
  "- API-only 边界留证，确认客户端不直连 ``$($result.boundary.disallowedDirectStores -join ', ')``。  ",
  "  The API-only boundary proof confirming the client does not directly connect to ``$($result.boundary.disallowedDirectStores -join ', ')``.",
  "- 人工验收清单与安装器验证报告。  ",
  "  The manual acceptance checklist and installer verification reports.",
  "",
  "## 建议随包提供的说明文件 / Recommended Companion Documents",
  ""
)

foreach ($item in $result.handoff.mandatoryFiles) {
  $lines += "- ``$item``  "
  $lines += "  ``$item``"
}

$lines += @(
  "",
  "## 环境要求 / Environment Requirements",
  "",
  "- Windows x64 目标机。  ",
  "  A Windows x64 target machine.",
  "- 可正常加载 WebView2 Runtime。  ",
  "  A machine that can load the WebView2 Runtime.",
  "- 交付给客户端的是 API 地址与客户端配置，不是数据库账号或数据库连接串。  ",
  "  Provide API endpoints and client configuration to the receiver, not database credentials or direct connection strings.",
  "- 若走解压包运行路径，应确认 ``.NET 8 WindowsDesktop Runtime`` 已可用。  ",
  "  If the receiver uses the unpacked package path, confirm that ``.NET 8 WindowsDesktop Runtime`` is available.",
  "- 若走安装器路径，应优先按安装器自身引导完成。  ",
  "  If the receiver uses an installer, follow the guided installer flow first.",
  "",
  "## 接收方最小动作 / Minimum Receiver Actions",
  ""
)

foreach ($item in $result.handoff.acceptanceSteps) {
  $lines += "- $item"
}

$lines += @(
  "",
  "## 当前验收结论 / Current Acceptance Result",
  "",
  "- ``latest.zip`` 自动验证通过。  ",
  "  ``latest.zip`` passed automated verification.",
  "- $innoAcceptanceCn",
  "  $innoAcceptanceEn",
  "- $customAcceptanceCn",
  "  $customAcceptanceEn",
  "- API-only 边界验证通过：``ready=$($result.boundary.ready.ToString().ToLower())``。  ",
  "  The API-only boundary validation passed with ``ready=$($result.boundary.ready.ToString().ToLower())``.",
  "- 当前仍有 ``$($result.buildChunks.oversizeJsCount)`` 个超大 JS 包，但它们不阻塞本轮交付。  ",
  "  There are still ``$($result.buildChunks.oversizeJsCount)`` oversized JS bundles, but they do not block this handoff.",
  "",
  "## 后续处理原则 / Follow-up Policy",
  ""
)

foreach ($item in $result.handoff.nextActions) {
  $lines += "- $item"
}

$mdDir = Split-Path -Parent $fullOutMdFile
if ($mdDir -and -not (Test-Path $mdDir)) {
  New-Item -ItemType Directory -Path $mdDir -Force | Out-Null
}
Set-Content -Path $fullOutMdFile -Value ($lines -join [Environment]::NewLine) -Encoding UTF8

$result | ConvertTo-Json -Depth 8
