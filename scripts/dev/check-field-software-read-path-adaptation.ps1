[CmdletBinding()]
param(
  [string]$CenterRuntimeFreezeFile = "docs/unified/reports/field-center-runtime-freeze-latest.json",
  [string]$Rk3568ProductionUplinkFreezeFile = "docs/unified/reports/field-rk3568-production-uplink-freeze-latest.json",
  [string]$LiveClosureFile = "docs/unified/reports/field-rk3568-center-live-closure-latest.json",
  [string]$WebDevicesApiFile = "apps/web/lib/api/devices.ts",
  [string]$ApiDataRouteFile = "services/api/src/routes/data.ts",
  [string]$ApiReadmeFile = "services/api/README.md",
  [string]$OutFile = "docs/unified/reports/field-software-read-path-adaptation-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Resolve-RepoRoot() {
  $here = Get-Location
  $dir = $here.Path
  while ($dir -and -not (Test-Path (Join-Path $dir "package.json"))) {
    $parent = Split-Path -Parent $dir
    if ($parent -eq $dir) { break }
    $dir = $parent
  }
  if (-not $dir -or -not (Test-Path (Join-Path $dir "package.json"))) {
    throw "Cannot find repo root (package.json). Run this script from inside the repo."
  }
  return $dir
}

function Resolve-RepoPath {
  param(
    [string]$RootPath,
    [string]$CandidatePath
  )

  if ([System.IO.Path]::IsPathRooted($CandidatePath)) {
    return [System.IO.Path]::GetFullPath($CandidatePath)
  }

  return Join-Path $RootPath $CandidatePath
}

function Read-JsonFile {
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }

  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) | ConvertFrom-Json
}

function Read-TextFile {
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }

  return Get-Content -LiteralPath $Path -Raw -Encoding UTF8
}

function Get-Check {
  param(
    [string]$Key,
    [bool]$Ok,
    $Actual,
    $Expected
  )

  [pscustomobject]@{
    key = $Key
    ok = $Ok
    actual = $Actual
    expected = $Expected
  }
}

function Normalize-StringArray {
  param(
    [object[]]$Items
  )

  return @($Items | ForEach-Object { [string]$_ } | Sort-Object -Unique)
}

function Compare-StringArray {
  param(
    [object[]]$Left,
    [object[]]$Right
  )

  $leftNorm = Normalize-StringArray -Items $Left
  $rightNorm = Normalize-StringArray -Items $Right
  if ($leftNorm.Count -ne $rightNorm.Count) {
    return $false
  }
  for ($i = 0; $i -lt $leftNorm.Count; $i++) {
    if ($leftNorm[$i] -ne $rightNorm[$i]) {
      return $false
    }
  }
  return $true
}

function Test-TextContains {
  param(
    [string]$Text,
    [string]$Pattern
  )

  return $Text.Contains($Pattern)
}

$repoRoot = Resolve-RepoRoot
$resolvedCenterRuntimeFreezeFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $CenterRuntimeFreezeFile
$resolvedRk3568ProductionUplinkFreezeFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $Rk3568ProductionUplinkFreezeFile
$resolvedLiveClosureFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $LiveClosureFile
$resolvedWebDevicesApiFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $WebDevicesApiFile
$resolvedApiDataRouteFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $ApiDataRouteFile
$resolvedApiReadmeFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $ApiReadmeFile
$resolvedOutFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutFile

$centerRuntimeFreeze = Read-JsonFile -Path $resolvedCenterRuntimeFreezeFile -Label "Center runtime freeze report"
$rk3568ProductionFreeze = Read-JsonFile -Path $resolvedRk3568ProductionUplinkFreezeFile -Label "RK3568 production uplink freeze report"
$liveClosure = Read-JsonFile -Path $resolvedLiveClosureFile -Label "Live closure report"
$webDevicesApiText = Read-TextFile -Path $resolvedWebDevicesApiFile -Label "Web devices API file"
$apiDataRouteText = Read-TextFile -Path $resolvedApiDataRouteFile -Label "API data route file"
$apiReadmeText = Read-TextFile -Path $resolvedApiReadmeFile -Label "API README file"

$expectedMetrics = @($liveClosure.livePlatform.expectedFieldMetrics)
$nodeAApi = $liveClosure.livePlatform.nodeA.api
$nodeAWeb = $liveClosure.livePlatform.nodeA.web
$nodeBApi = $liveClosure.livePlatform.nodeB.api
$nodeBWeb = $liveClosure.livePlatform.nodeB.web

$nodeAMetricsMatchExpected = Compare-StringArray -Left $nodeAApi.snapshot.metricsKeys -Right $expectedMetrics
$nodeAWebMetricsMatchExpected = Compare-StringArray -Left $nodeAWeb.snapshot.metricsKeys -Right $expectedMetrics
$nodeBMetricsMatchExpected = Compare-StringArray -Left $nodeBApi.snapshot.metricsKeys -Right $expectedMetrics
$nodeBWebMetricsMatchExpected = Compare-StringArray -Left $nodeBWeb.snapshot.metricsKeys -Right $expectedMetrics
$nodeAApiWebParity = Compare-StringArray -Left $nodeAApi.snapshot.metricsKeys -Right $nodeAWeb.snapshot.metricsKeys
$nodeBApiWebParity = Compare-StringArray -Left $nodeBApi.snapshot.metricsKeys -Right $nodeBWeb.snapshot.metricsKeys

$checks = @(
  (Get-Check -Key "centerRuntimeFreezeAccepted" -Ok:([bool]$centerRuntimeFreeze.accepted) -Actual ([bool]$centerRuntimeFreeze.accepted) -Expected $true),
  (Get-Check -Key "centerRuntimeFreezeBoundary" -Ok:([string]$centerRuntimeFreeze.currentBoundary -eq "center-runtime-freeze-ready") -Actual ([string]$centerRuntimeFreeze.currentBoundary) -Expected "center-runtime-freeze-ready"),
  (Get-Check -Key "rk3568ProductionFreezeAccepted" -Ok:([bool]$rk3568ProductionFreeze.accepted) -Actual ([bool]$rk3568ProductionFreeze.accepted) -Expected $true),
  (Get-Check -Key "rk3568ProductionFreezeBoundary" -Ok:([string]$rk3568ProductionFreeze.currentBoundary -eq "rk3568-production-uplink-freeze-ready") -Actual ([string]$rk3568ProductionFreeze.currentBoundary) -Expected "rk3568-production-uplink-freeze-ready"),
  (Get-Check -Key "liveClosureAccepted" -Ok:([bool]$liveClosure.accepted) -Actual ([bool]$liveClosure.accepted) -Expected $true),
  (Get-Check -Key "liveClosureBoundary" -Ok:([string]$liveClosure.currentBoundary -eq "rk3568-live-center-closure-ready") -Actual ([string]$liveClosure.currentBoundary) -Expected "rk3568-live-center-closure-ready"),
  (Get-Check -Key "nodeAApiPassed" -Ok:([bool]$nodeAApi.check.passed) -Actual ([bool]$nodeAApi.check.passed) -Expected $true),
  (Get-Check -Key "nodeAApiMetricsContract" -Ok:([bool]$nodeAApi.check.metricsContractOk -and $nodeAMetricsMatchExpected) -Actual ([int]$nodeAApi.snapshot.metricsKeyCount) -Expected ($expectedMetrics.Count)),
  (Get-Check -Key "nodeAWebPassed" -Ok:([bool]$nodeAWeb.check.passed) -Actual ([bool]$nodeAWeb.check.passed) -Expected $true),
  (Get-Check -Key "nodeAWebMetricsContract" -Ok:([bool]$nodeAWeb.check.metricsContractOk -and $nodeAWebMetricsMatchExpected) -Actual ([int]$nodeAWeb.snapshot.metricsKeyCount) -Expected ($expectedMetrics.Count)),
  (Get-Check -Key "nodeAApiWebParity" -Ok:$nodeAApiWebParity -Actual ($nodeAApi.snapshot.metricsKeyCount) -Expected ($nodeAWeb.snapshot.metricsKeyCount)),
  (Get-Check -Key "nodeBApiPassed" -Ok:([bool]$nodeBApi.check.passed) -Actual ([bool]$nodeBApi.check.passed) -Expected $true),
  (Get-Check -Key "nodeBApiMetricsContract" -Ok:([bool]$nodeBApi.check.metricsContractOk -and $nodeBMetricsMatchExpected) -Actual ([int]$nodeBApi.snapshot.metricsKeyCount) -Expected ($expectedMetrics.Count)),
  (Get-Check -Key "nodeBWebPassed" -Ok:([bool]$nodeBWeb.check.passed) -Actual ([bool]$nodeBWeb.check.passed) -Expected $true),
  (Get-Check -Key "nodeBWebMetricsContract" -Ok:([bool]$nodeBWeb.check.metricsContractOk -and $nodeBWebMetricsMatchExpected) -Actual ([int]$nodeBWeb.snapshot.metricsKeyCount) -Expected ($expectedMetrics.Count)),
  (Get-Check -Key "nodeBApiWebParity" -Ok:$nodeBApiWebParity -Actual ($nodeBApi.snapshot.metricsKeyCount) -Expected ($nodeBWeb.snapshot.metricsKeyCount)),
  (Get-Check -Key "webDevicesApiUsesDevicesEndpoint" -Ok:(Test-TextContains -Text $webDevicesApiText -Pattern "/api/v1/devices?") -Actual (Test-TextContains -Text $webDevicesApiText -Pattern "/api/v1/devices?") -Expected $true),
  (Get-Check -Key "webDevicesApiUsesStateEndpoint" -Ok:(Test-TextContains -Text $webDevicesApiText -Pattern "/api/v1/data/state/") -Actual (Test-TextContains -Text $webDevicesApiText -Pattern "/api/v1/data/state/") -Expected $true),
  (Get-Check -Key "apiRouteExposesStateEndpoint" -Ok:(Test-TextContains -Text $apiDataRouteText -Pattern '/data/state/:deviceId') -Actual (Test-TextContains -Text $apiDataRouteText -Pattern '/data/state/:deviceId') -Expected $true),
  (Get-Check -Key "apiRouteUsesDeviceState" -Ok:(Test-TextContains -Text $apiDataRouteText -Pattern 'FROM device_state') -Actual (Test-TextContains -Text $apiDataRouteText -Pattern 'FROM device_state') -Expected $true),
  (Get-Check -Key "apiReadmeMentionsStateEndpoint" -Ok:(Test-TextContains -Text $apiReadmeText -Pattern 'GET /api/v1/data/state/{deviceId}') -Actual (Test-TextContains -Text $apiReadmeText -Pattern 'GET /api/v1/data/state/{deviceId}') -Expected $true)
)

$accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
$failedKeys = @($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })

$report = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  accepted = $accepted
  mode = "field-software-read-path-adaptation"
  currentBoundary = if ($accepted) { "software-read-path-adaptation-ready" } else { "software-read-path-adaptation-needs-review" }
  upstreamBaselines = [ordered]@{
    centerRuntimeFreeze = [ordered]@{
      file = $CenterRuntimeFreezeFile.Replace("\", "/")
      accepted = [bool]$centerRuntimeFreeze.accepted
      boundary = [string]$centerRuntimeFreeze.currentBoundary
    }
    rk3568ProductionUplinkFreeze = [ordered]@{
      file = $Rk3568ProductionUplinkFreezeFile.Replace("\", "/")
      accepted = [bool]$rk3568ProductionFreeze.accepted
      boundary = [string]$rk3568ProductionFreeze.currentBoundary
    }
    liveClosure = [ordered]@{
      file = $LiveClosureFile.Replace("\", "/")
      accepted = [bool]$liveClosure.accepted
      boundary = [string]$liveClosure.currentBoundary
    }
  }
  expectedFieldMetrics = Normalize-StringArray -Items $expectedMetrics
  nodeReadPaths = [ordered]@{
    nodeA = [ordered]@{
      deviceId = [string]$liveClosure.livePlatform.nodeA.deviceId
      installLabel = [string]$liveClosure.livePlatform.nodeA.expectedInstallLabel
      apiMetricsKeys = Normalize-StringArray -Items @($nodeAApi.snapshot.metricsKeys)
      webMetricsKeys = Normalize-StringArray -Items @($nodeAWeb.snapshot.metricsKeys)
      apiUpdatedAt = [string]$nodeAApi.snapshot.updatedAt
      webUpdatedAt = [string]$nodeAWeb.snapshot.updatedAt
    }
    nodeB = [ordered]@{
      deviceId = [string]$liveClosure.livePlatform.nodeB.deviceId
      installLabel = [string]$liveClosure.livePlatform.nodeB.expectedInstallLabel
      apiMetricsKeys = Normalize-StringArray -Items @($nodeBApi.snapshot.metricsKeys)
      webMetricsKeys = Normalize-StringArray -Items @($nodeBWeb.snapshot.metricsKeys)
      apiUpdatedAt = [string]$nodeBApi.snapshot.updatedAt
      webUpdatedAt = [string]$nodeBWeb.snapshot.updatedAt
    }
  }
  staticBindings = [ordered]@{
    webDevicesApiFile = $WebDevicesApiFile.Replace("\", "/")
    apiDataRouteFile = $ApiDataRouteFile.Replace("\", "/")
    apiReadmeFile = $ApiReadmeFile.Replace("\", "/")
  }
  failureKeys = $failedKeys
  nextUse = @(
    "refresh software read-path adaptation: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-software-read-path-adaptation.ps1",
    "refresh live closure baseline: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-center-live-closure.ps1 -BoardPassword <password> -AllowUnsafeSecrets",
    "refresh rk3568 uplink freeze: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-production-uplink-freeze.ps1 -Password <password>"
  )
  checks = $checks
}

$outDir = Split-Path -Parent $resolvedOutFile
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$json = $report | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $resolvedOutFile -Value $json -Encoding UTF8
$json
