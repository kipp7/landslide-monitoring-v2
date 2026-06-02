[CmdletBinding()]
param(
  [string]$PackageManifestFile = "docs/unified/reports/desk-win-package-latest.json",
  [string]$BuildInfoFile = "docs/unified/reports/desk-win-build-info-latest.json",
  [string]$PackageVerifyFile = "docs/unified/reports/desk-win-package-verify-latest.json",
  [string]$PrerequisitesFile = "docs/unified/reports/desk-win-prerequisites-latest.json",
  [string]$BoundaryReportFile = "docs/unified/reports/desk-api-boundary-latest.json",
  [string]$DeliveryCheckFile = "docs/unified/reports/desk-win-delivery-latest.json",
  [string]$DeliveryHashFile = "docs/unified/reports/desk-win-delivery-hash-latest.json",
  [string]$BuildChunkFile = "docs/unified/reports/desk-build-chunks-latest.json",
  [string]$DeliveryIndexFile = "docs/unified/reports/desk-win-delivery-index-latest.json",
  [string]$LatestVerifyFile = "docs/unified/reports/desk-win-latest-package-verify-latest.json",
  [string]$DeliverySummaryFile = "docs/unified/reports/desk-win-delivery-summary-latest.md",
  [string]$ReleaseNotesFile = "docs/unified/reports/desk-win-release-notes-latest.md",
  [string]$ProductionHandoffFile = "docs/unified/reports/desk-win-production-handoff-latest.md",
  [string]$ProductionHandoffJsonFile = "docs/unified/reports/desk-win-production-handoff-latest.json",
  [string]$ManualAcceptanceMdFile = "docs/unified/reports/desk-win-manual-acceptance-latest.md",
  [string]$ManualAcceptanceJsonFile = "docs/unified/reports/desk-win-manual-acceptance-latest.json",
  [string]$InstallerReportFile = "docs/unified/reports/desk-win-installer-latest.json",
  [string]$InstallerVerifyFile = "docs/unified/reports/desk-win-installer-verify-latest.json",
  [string]$CustomInstallerReportFile = "docs/unified/reports/desk-win-customba-installer-latest.json",
  [string]$CustomInstallerVerifyFile = "docs/unified/reports/desk-win-customba-installer-verify-latest.json",
  [string]$EnvMatrixFile = "docs/unified/reports/desk-win-env-matrix.md",
  [string]$ChecklistFile = "docs/unified/reports/desk-win-delivery-checklist.md",
  [string]$OutDir = "artifacts/desk-win/delivery",
  [string]$Tag = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function New-ZipArchiveFromDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDir,
    [Parameter(Mandatory = $true)]
    [string]$DestinationZip
  )

  if (-not (Test-Path -LiteralPath $SourceDir)) {
    throw "archive source directory not found: $SourceDir"
  }

  if (Test-Path -LiteralPath $DestinationZip) {
    Remove-Item -LiteralPath $DestinationZip -Force
  }

  $tarCommand = Get-Command "tar.exe" -ErrorAction SilentlyContinue
  if ($tarCommand) {
    & $tarCommand.Source -a -cf $DestinationZip -C $SourceDir .
    if ($LASTEXITCODE -ne 0) {
      throw "tar.exe failed while creating delivery zip (exit=$LASTEXITCODE)"
    }
  } else {
    Compress-Archive -Path (Join-Path $SourceDir "*") -DestinationPath $DestinationZip -Force
  }

  if (-not (Test-Path -LiteralPath $DestinationZip)) {
    throw "delivery zip was not created: $DestinationZip"
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullPackageManifest = Join-Path $repoRoot $PackageManifestFile
$fullBuildInfo = Join-Path $repoRoot $BuildInfoFile
$fullPackageVerify = Join-Path $repoRoot $PackageVerifyFile
$fullPrerequisites = Join-Path $repoRoot $PrerequisitesFile
$fullBoundaryReport = Join-Path $repoRoot $BoundaryReportFile
$fullDeliveryCheck = Join-Path $repoRoot $DeliveryCheckFile
$fullDeliveryHash = Join-Path $repoRoot $DeliveryHashFile
$fullBuildChunk = Join-Path $repoRoot $BuildChunkFile
$fullDeliveryIndex = Join-Path $repoRoot $DeliveryIndexFile
$fullLatestVerify = Join-Path $repoRoot $LatestVerifyFile
$fullDeliverySummary = Join-Path $repoRoot $DeliverySummaryFile
$fullReleaseNotes = Join-Path $repoRoot $ReleaseNotesFile
$fullProductionHandoff = Join-Path $repoRoot $ProductionHandoffFile
$fullProductionHandoffJson = Join-Path $repoRoot $ProductionHandoffJsonFile
$fullManualAcceptanceMd = Join-Path $repoRoot $ManualAcceptanceMdFile
$fullManualAcceptanceJson = Join-Path $repoRoot $ManualAcceptanceJsonFile
$fullInstallerReport = Join-Path $repoRoot $InstallerReportFile
$fullInstallerVerify = Join-Path $repoRoot $InstallerVerifyFile
$fullCustomInstallerReport = Join-Path $repoRoot $CustomInstallerReportFile
$fullCustomInstallerVerify = Join-Path $repoRoot $CustomInstallerVerifyFile
$fullEnvMatrix = Join-Path $repoRoot $EnvMatrixFile
$fullChecklist = Join-Path $repoRoot $ChecklistFile
$fullOutDir = Join-Path $repoRoot $OutDir
$reportFile = Join-Path $repoRoot "docs/unified/reports/desk-win-delivery-bundle-latest.json"

foreach ($path in @($fullPackageManifest, $fullBuildInfo, $fullPackageVerify, $fullPrerequisites, $fullBoundaryReport, $fullDeliveryCheck, $fullDeliveryHash, $fullBuildChunk, $fullDeliveryIndex, $fullLatestVerify, $fullDeliverySummary, $fullReleaseNotes, $fullProductionHandoff, $fullProductionHandoffJson, $fullManualAcceptanceMd, $fullManualAcceptanceJson, $fullInstallerReport, $fullInstallerVerify, $fullCustomInstallerReport, $fullCustomInstallerVerify, $fullEnvMatrix, $fullChecklist)) {
  if (-not (Test-Path $path)) {
    throw "required file not found: $path"
  }
}

$packageManifest = Get-Content -Path $fullPackageManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$packageDir = Join-Path $repoRoot ([string]$packageManifest.outputDir)
if (-not (Test-Path $packageDir)) {
  throw "desk-win package output missing: $packageDir"
}

if (-not $Tag) {
  $Tag = Get-Date -Format "yyyyMMdd-HHmmss"
}

$bundleName = "desk-win-delivery-$Tag"
$bundleDir = Join-Path $fullOutDir $bundleName
$bundleZip = Join-Path $fullOutDir "$bundleName.zip"

if (Test-Path $bundleDir) {
  Remove-Item -Path $bundleDir -Recurse -Force
}
if (Test-Path $bundleZip) {
  Remove-Item -Path $bundleZip -Force
}

New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "package") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "installer") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "custom-installer") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "docs") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "reports") -Force | Out-Null

Copy-Item -Path (Join-Path $packageDir "*") -Destination (Join-Path $bundleDir "package") -Recurse -Force
Copy-Item -Path ([string]((Get-Content -Path $fullInstallerReport -Raw -Encoding UTF8 | ConvertFrom-Json).installer.path)) -Destination (Join-Path $bundleDir "installer") -Force
Copy-Item -Path ([string]((Get-Content -Path $fullCustomInstallerReport -Raw -Encoding UTF8 | ConvertFrom-Json).installer.path)) -Destination (Join-Path $bundleDir "custom-installer") -Force
Copy-Item -Path (Join-Path $repoRoot "apps/desk-win/README.md") -Destination (Join-Path $bundleDir "docs/desk-win-README.md") -Force
Copy-Item -Path $fullEnvMatrix -Destination (Join-Path $bundleDir "docs/desk-win-env-matrix.md") -Force
Copy-Item -Path $fullChecklist -Destination (Join-Path $bundleDir "docs/desk-win-delivery-checklist.md") -Force
Copy-Item -Path $fullDeliveryIndex -Destination (Join-Path $bundleDir "docs/desk-win-delivery-index-latest.json") -Force
Copy-Item -Path $fullBuildChunk -Destination (Join-Path $bundleDir "docs/desk-build-chunks-latest.json") -Force
Copy-Item -Path $fullDeliverySummary -Destination (Join-Path $bundleDir "docs/desk-win-delivery-summary-latest.md") -Force
Copy-Item -Path $fullReleaseNotes -Destination (Join-Path $bundleDir "docs/desk-win-release-notes-latest.md") -Force
Copy-Item -Path $fullProductionHandoff -Destination (Join-Path $bundleDir "docs/desk-win-production-handoff-latest.md") -Force
Copy-Item -Path $fullManualAcceptanceMd -Destination (Join-Path $bundleDir "docs/desk-win-manual-acceptance-latest.md") -Force
Copy-Item -Path $fullInstallerReport -Destination (Join-Path $bundleDir "docs/desk-win-installer-latest.json") -Force
Copy-Item -Path $fullCustomInstallerReport -Destination (Join-Path $bundleDir "docs/desk-win-customba-installer-latest.json") -Force
Copy-Item -Path $fullPackageManifest -Destination (Join-Path $bundleDir "reports/desk-win-package-latest.json") -Force
Copy-Item -Path $fullBuildInfo -Destination (Join-Path $bundleDir "reports/desk-win-build-info-latest.json") -Force
Copy-Item -Path $fullPackageVerify -Destination (Join-Path $bundleDir "reports/desk-win-package-verify-latest.json") -Force
Copy-Item -Path $fullLatestVerify -Destination (Join-Path $bundleDir "reports/desk-win-latest-package-verify-latest.json") -Force
Copy-Item -Path $fullPrerequisites -Destination (Join-Path $bundleDir "reports/desk-win-prerequisites-latest.json") -Force
Copy-Item -Path $fullBoundaryReport -Destination (Join-Path $bundleDir "reports/desk-api-boundary-latest.json") -Force
Copy-Item -Path $fullDeliveryCheck -Destination (Join-Path $bundleDir "reports/desk-win-delivery-latest.json") -Force
Copy-Item -Path $fullDeliveryHash -Destination (Join-Path $bundleDir "reports/desk-win-delivery-hash-latest.json") -Force
Copy-Item -Path $fullBuildChunk -Destination (Join-Path $bundleDir "reports/desk-build-chunks-latest.json") -Force
Copy-Item -Path $fullDeliveryIndex -Destination (Join-Path $bundleDir "reports/desk-win-delivery-index-latest.json") -Force
Copy-Item -Path $fullProductionHandoffJson -Destination (Join-Path $bundleDir "reports/desk-win-production-handoff-latest.json") -Force
Copy-Item -Path $fullManualAcceptanceJson -Destination (Join-Path $bundleDir "reports/desk-win-manual-acceptance-latest.json") -Force
Copy-Item -Path $fullInstallerReport -Destination (Join-Path $bundleDir "reports/desk-win-installer-latest.json") -Force
Copy-Item -Path $fullInstallerVerify -Destination (Join-Path $bundleDir "reports/desk-win-installer-verify-latest.json") -Force
Copy-Item -Path $fullCustomInstallerReport -Destination (Join-Path $bundleDir "reports/desk-win-customba-installer-latest.json") -Force
Copy-Item -Path $fullCustomInstallerVerify -Destination (Join-Path $bundleDir "reports/desk-win-customba-installer-verify-latest.json") -Force

$bundleStart = @'
param()
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Resolve-Path $PSCommandPath)
$exe = Join-Path $root "package\LandslideDesk.Win.exe"
if (-not (Test-Path $exe)) { throw "packaged exe not found: $exe" }
Remove-Item Env:DESK_DEV_SERVER_URL -ErrorAction SilentlyContinue
$proc = Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) -PassThru
[pscustomobject]@{
  started = $true
  pid = $proc.Id
  exe = $exe
} | ConvertTo-Json -Depth 4
'@
Set-Content -Path (Join-Path $bundleDir "start-packaged.ps1") -Value $bundleStart -Encoding UTF8

$bundleStop = @'
param()
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Resolve-Path $PSCommandPath)
$exe = Join-Path $root "package\LandslideDesk.Win.exe"
$targets = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -eq "LandslideDesk.Win.exe" -and $_.ExecutablePath -eq $exe
})
foreach ($proc in $targets) {
  Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}
[pscustomobject]@{
  stopped = $true
  count = $targets.Count
  pids = @($targets | ForEach-Object { $_.ProcessId })
} | ConvertTo-Json -Depth 4
'@
Set-Content -Path (Join-Path $bundleDir "stop-packaged.ps1") -Value $bundleStop -Encoding UTF8

$bundleVerify = @'
param([int]$WaitSeconds = 10)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Resolve-Path $PSCommandPath)
$exe = Join-Path $root "package\LandslideDesk.Win.exe"
$web = Join-Path $root "package\web\index.html"
if (-not (Test-Path $exe)) { throw "packaged exe not found: $exe" }
if (-not (Test-Path $web)) { throw "packaged web assets missing: $web" }
Remove-Item Env:DESK_DEV_SERVER_URL -ErrorAction SilentlyContinue
$proc = Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) -PassThru
$alive = $false
for ($i = 0; $i -lt $WaitSeconds; $i++) {
  Start-Sleep -Seconds 1
  if (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue) {
    $alive = $true
    break
  }
}
$stopped = $false
try {
  Stop-Process -Id $proc.Id -Force -ErrorAction Stop
  $stopped = $true
} catch {
  if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) { $stopped = $true }
}
[pscustomobject]@{
  ready = ($alive -and $stopped)
  exe = $exe
  web = $web
  aliveAfterLaunch = $alive
  stoppedAfterVerify = $stopped
} | ConvertTo-Json -Depth 4
'@
Set-Content -Path (Join-Path $bundleDir "verify-packaged.ps1") -Value $bundleVerify -Encoding UTF8

$readme = @"
Desk-win Delivery Bundle

Contents:
- package/: published desk-win package
- docs/: delivery docs and environment matrix
- reports/: package / verify / prerequisites / api-boundary / delivery / hash reports
- installer/: current Inno installer
- custom-installer/: current custom BA installer
- start-packaged.ps1 / stop-packaged.ps1 / verify-packaged.ps1: standalone helper scripts

Delivery boundary:
- current formal client: desk-win
- business data entry: API-only
- do not provide direct PostgreSQL / ClickHouse connection details to the client

Recommended validation order:
1. Read docs/desk-win-env-matrix.md
2. Read docs/desk-win-delivery-checklist.md
3. Read docs/desk-win-delivery-summary-latest.md
4. Read docs/desk-win-release-notes-latest.md
5. Read docs/desk-win-manual-acceptance-latest.md
6. Read docs/desk-win-delivery-index-latest.json
7. Check reports/desk-win-delivery-latest.json (`ready` should be true)
8. Check reports/desk-api-boundary-latest.json (`ready` should be true)
9. Run .\verify-packaged.ps1
10. Run .\start-packaged.ps1
"@
Set-Content -Path (Join-Path $bundleDir "README.txt") -Value $readme -Encoding UTF8

New-ZipArchiveFromDirectory -SourceDir $bundleDir -DestinationZip $bundleZip

$bundleFiles = Get-ChildItem -Path $bundleDir -Recurse -File
$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  bundleName = $bundleName
  bundleDir = $bundleDir
  bundleZip = $bundleZip
  packageDir = $packageDir
  fileCount = @($bundleFiles).Count
  totalBytes = (@($bundleFiles | Measure-Object -Property Length -Sum).Sum)
}

$json = $result | ConvertTo-Json -Depth 6
$reportDir = Split-Path -Parent $reportFile
if ($reportDir -and -not (Test-Path $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}
Set-Content -Path $reportFile -Value $json -Encoding UTF8
$json
