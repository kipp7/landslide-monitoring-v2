[CmdletBinding()]
param(
  [string]$CenterRuntimeFreezeFile = "docs/unified/reports/field-center-runtime-freeze-latest.json",
  [string]$Rk3568ProductionUplinkFreezeFile = "docs/unified/reports/field-rk3568-production-uplink-freeze-latest.json",
  [string]$LiveClosureFile = "docs/unified/reports/field-rk3568-center-live-closure-latest.json",
  [string]$ApiBaseUrl = "http://127.0.0.1:8080",
  [string]$WebBaseUrl = "http://127.0.0.1:3000",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [int]$FreshnessSeconds = 180,
  [string]$NodeADeviceId = "00000000-0000-0000-0000-000000000001",
  [string]$NodeBDeviceId = "00000000-0000-0000-0000-000000000002",
  [string]$NodeCDeviceId = "00000000-0000-0000-0000-000000000003",
  [string]$NodeAInstallLabel = "FIELD-NODE-A",
  [string]$NodeBInstallLabel = "FIELD-NODE-B",
  [string]$NodeCInstallLabel = "FIELD-NODE-C",
  [string]$WebDevicesApiFile = "apps/web/lib/api/devices.ts",
  [string]$ApiDataRouteFile = "services/api/src/routes/data.ts",
  [string]$ApiReadmeFile = "services/api/README.md",
  [string]$OutFile = "docs/unified/reports/field-software-read-path-adaptation-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ExpectedFieldMetrics = @(
  "accel_x_g",
  "accel_y_g",
  "accel_z_g",
  "battery_pct",
  "gps_latitude",
  "gps_longitude",
  "gyro_x_dps",
  "gyro_y_dps",
  "gyro_z_dps",
  "humidity_pct",
  "temperature_c",
  "tilt_x_deg",
  "tilt_y_deg",
  "warning_flag"
) | Sort-Object -Unique

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

function Try-ReadJsonFile {
  param(
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  try {
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) | ConvertFrom-Json
  } catch {
    return $null
  }
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

function Convert-ToUtcDateTime {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  return ([DateTimeOffset]::Parse($Text)).UtcDateTime
}

function New-AuthSession {
  param(
    [string]$BaseUrl,
    [string]$UserNameValue,
    [string]$PasswordValue
  )

  $loginUri = ($BaseUrl.TrimEnd("/") + "/api/v1/auth/login")
  $loginBody = @{
    username = $UserNameValue
    password = $PasswordValue
  } | ConvertTo-Json -Compress

  $login = Invoke-RestMethod -Uri $loginUri -Method Post -ContentType "application/json" -Body $loginBody -Headers @{
    Accept = "application/json"
  }

  $token = [string]$login.data.token
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw "Auth token missing from $loginUri"
  }

  $headers = @{
    Accept = "application/json"
    Authorization = "Bearer $token"
  }

  return [pscustomobject]@{
    baseUrl = $BaseUrl.TrimEnd("/")
    headers = $headers
  }
}

function Get-DeviceListSnapshot {
  param($Session)

  return Invoke-RestMethod -Uri ($Session.baseUrl + "/api/v1/devices?page=1&pageSize=200") -Method Get -Headers $Session.headers
}

function Get-DeviceStateSnapshot {
  param(
    $Session,
    [string]$DeviceId
  )

  return Invoke-RestMethod -Uri ($Session.baseUrl + "/api/v1/data/state/" + [uri]::EscapeDataString($DeviceId)) -Method Get -Headers $Session.headers
}

function Get-ReadPathSnapshot {
  param(
    [string]$Label,
    $Session,
    [string]$DeviceId
  )

  $devicesResponse = Get-DeviceListSnapshot -Session $Session
  $stateResponse = Get-DeviceStateSnapshot -Session $Session -DeviceId $DeviceId

  $deviceList = @($devicesResponse.data.list)
  $deviceEntry = @($deviceList | Where-Object { $_.deviceId -eq $DeviceId } | Select-Object -First 1)[0]
  $stateData = $stateResponse.data
  $state = $stateData.state
  $metrics = if ($state.metrics) { @($state.metrics.PSObject.Properties) } else { @() }
  $meta = $state.meta
  $updatedAtText = [string]$stateData.updatedAt
  $updatedAtUtc = Convert-ToUtcDateTime -Text $updatedAtText
  $ageSeconds = if ($updatedAtUtc) {
    [Math]::Round(((Get-Date).ToUniversalTime() - $updatedAtUtc).TotalSeconds, 3)
  } else {
    $null
  }

  return [pscustomobject][ordered]@{
    label = $Label
    baseUrl = $Session.baseUrl
    deviceFound = ($null -ne $deviceEntry)
    listCount = $deviceList.Count
    matchedDeviceLastSeenAt = if ($deviceEntry) { [string]$deviceEntry.lastSeenAt } else { $null }
    updatedAt = $updatedAtText
    updatedAtAgeSeconds = $ageSeconds
    metricsKeyCount = $metrics.Count
    metricsKeys = @($metrics | ForEach-Object { $_.Name } | Sort-Object -Unique)
    installLabel = if ($meta -and $null -ne $meta.PSObject.Properties["install_label"]) { [string]$meta.install_label } else { "" }
    lastCommandId = if ($meta -and $null -ne $meta.PSObject.Properties["last_command_id"]) { [string]$meta.last_command_id } else { "" }
    lastCommandType = if ($meta -and $null -ne $meta.PSObject.Properties["last_command_type"]) { [string]$meta.last_command_type } else { "" }
  }
}

function Get-ReadPathCheck {
  param(
    $Snapshot,
    [string]$ExpectedInstallLabel,
    [string[]]$ExpectedMetrics,
    [int]$MaxFreshnessSeconds
  )

  $metricsMatchExpected = Compare-StringArray -Left $Snapshot.metricsKeys -Right $ExpectedMetrics
  $freshEnough = ($null -ne $Snapshot.updatedAtAgeSeconds) -and ([double]$Snapshot.updatedAtAgeSeconds -le $MaxFreshnessSeconds)
  $installLabelOk = ([string]$Snapshot.installLabel -eq $ExpectedInstallLabel)

  return [pscustomobject][ordered]@{
    passed = ([bool]$Snapshot.deviceFound -and $metricsMatchExpected -and $freshEnough -and $installLabelOk)
    deviceFound = [bool]$Snapshot.deviceFound
    metricsPresent = ([int]$Snapshot.metricsKeyCount -gt 0)
    metricsContractOk = $metricsMatchExpected
    freshEnough = $freshEnough
    installLabelOk = $installLabelOk
    updatedAtAgeSeconds = $Snapshot.updatedAtAgeSeconds
  }
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
$liveClosure = Try-ReadJsonFile -Path $resolvedLiveClosureFile
$webDevicesApiText = Read-TextFile -Path $resolvedWebDevicesApiFile -Label "Web devices API file"
$apiDataRouteText = Read-TextFile -Path $resolvedApiDataRouteFile -Label "API data route file"
$apiReadmeText = Read-TextFile -Path $resolvedApiReadmeFile -Label "API README file"

$apiSession = New-AuthSession -BaseUrl $ApiBaseUrl -UserNameValue $Username -PasswordValue $Password
$webSession = New-AuthSession -BaseUrl $WebBaseUrl -UserNameValue $Username -PasswordValue $Password

$productionRuntime = $rk3568ProductionFreeze.runtime
$productionNodeStatuses = $productionRuntime.nodeStatuses
$productionNodeAStatus = [string]$productionNodeStatuses.nodeA
$productionNodeBStatus = [string]$productionNodeStatuses.nodeB
$productionNodeCStatus = [string]$productionNodeStatuses.nodeC
$productionStrictFailureKeys = @()
if ($null -ne $rk3568ProductionFreeze.frozenUplink -and $null -ne $rk3568ProductionFreeze.frozenUplink.failureKeys) {
  $productionStrictFailureKeys = @($rk3568ProductionFreeze.frozenUplink.failureKeys | ForEach-Object { [string]$_ })
}

$productionOperational = [ordered]@{
  serviceActive = ([string]$productionRuntime.serviceActive -eq "active")
  mqttConnected = [bool]$productionRuntime.mqttConnected
  serialOpen = [bool]$productionRuntime.serialOpen
  rejectedWriteFailuresZero = ([int]$productionRuntime.rejectedWriteFailures -eq 0)
  spoolPendingZero = ([int]$productionRuntime.spoolPending -eq 0)
  nodeAOperational = ($productionNodeAStatus -in @("online", "degraded"))
  nodeBOperational = ($productionNodeBStatus -in @("online", "degraded"))
  nodeCOperational = ($productionNodeCStatus -in @("online", "degraded"))
  ready = $false
}
$productionOperational.ready = (
  [bool]$productionOperational.serviceActive -and
  [bool]$productionOperational.mqttConnected -and
  [bool]$productionOperational.serialOpen -and
  [bool]$productionOperational.rejectedWriteFailuresZero -and
  [bool]$productionOperational.spoolPendingZero -and
  [bool]$productionOperational.nodeAOperational -and
  [bool]$productionOperational.nodeBOperational -and
  [bool]$productionOperational.nodeCOperational
)

$expectedMetrics = @($ExpectedFieldMetrics)
$nodeAApiSnapshot = Get-ReadPathSnapshot -Label "api-direct" -Session $apiSession -DeviceId $NodeADeviceId
$nodeAWebSnapshot = Get-ReadPathSnapshot -Label "web-proxy" -Session $webSession -DeviceId $NodeADeviceId
$nodeBApiSnapshot = Get-ReadPathSnapshot -Label "api-direct" -Session $apiSession -DeviceId $NodeBDeviceId
$nodeBWebSnapshot = Get-ReadPathSnapshot -Label "web-proxy" -Session $webSession -DeviceId $NodeBDeviceId
$nodeCApiSnapshot = Get-ReadPathSnapshot -Label "api-direct" -Session $apiSession -DeviceId $NodeCDeviceId
$nodeCWebSnapshot = Get-ReadPathSnapshot -Label "web-proxy" -Session $webSession -DeviceId $NodeCDeviceId

$nodeAApi = [pscustomobject]@{
  check = Get-ReadPathCheck -Snapshot $nodeAApiSnapshot -ExpectedInstallLabel $NodeAInstallLabel -ExpectedMetrics $expectedMetrics -MaxFreshnessSeconds $FreshnessSeconds
  snapshot = $nodeAApiSnapshot
}
$nodeAWeb = [pscustomobject]@{
  check = Get-ReadPathCheck -Snapshot $nodeAWebSnapshot -ExpectedInstallLabel $NodeAInstallLabel -ExpectedMetrics $expectedMetrics -MaxFreshnessSeconds $FreshnessSeconds
  snapshot = $nodeAWebSnapshot
}
$nodeBApi = [pscustomobject]@{
  check = Get-ReadPathCheck -Snapshot $nodeBApiSnapshot -ExpectedInstallLabel $NodeBInstallLabel -ExpectedMetrics $expectedMetrics -MaxFreshnessSeconds $FreshnessSeconds
  snapshot = $nodeBApiSnapshot
}
$nodeBWeb = [pscustomobject]@{
  check = Get-ReadPathCheck -Snapshot $nodeBWebSnapshot -ExpectedInstallLabel $NodeBInstallLabel -ExpectedMetrics $expectedMetrics -MaxFreshnessSeconds $FreshnessSeconds
  snapshot = $nodeBWebSnapshot
}
$nodeCApi = [pscustomobject]@{
  check = Get-ReadPathCheck -Snapshot $nodeCApiSnapshot -ExpectedInstallLabel $NodeCInstallLabel -ExpectedMetrics $expectedMetrics -MaxFreshnessSeconds $FreshnessSeconds
  snapshot = $nodeCApiSnapshot
}
$nodeCWeb = [pscustomobject]@{
  check = Get-ReadPathCheck -Snapshot $nodeCWebSnapshot -ExpectedInstallLabel $NodeCInstallLabel -ExpectedMetrics $expectedMetrics -MaxFreshnessSeconds $FreshnessSeconds
  snapshot = $nodeCWebSnapshot
}

$nodeAMetricsMatchExpected = Compare-StringArray -Left $nodeAApi.snapshot.metricsKeys -Right $expectedMetrics
$nodeAWebMetricsMatchExpected = Compare-StringArray -Left $nodeAWeb.snapshot.metricsKeys -Right $expectedMetrics
$nodeBMetricsMatchExpected = Compare-StringArray -Left $nodeBApi.snapshot.metricsKeys -Right $expectedMetrics
$nodeBWebMetricsMatchExpected = Compare-StringArray -Left $nodeBWeb.snapshot.metricsKeys -Right $expectedMetrics
$nodeCMetricsMatchExpected = Compare-StringArray -Left $nodeCApi.snapshot.metricsKeys -Right $expectedMetrics
$nodeCWebMetricsMatchExpected = Compare-StringArray -Left $nodeCWeb.snapshot.metricsKeys -Right $expectedMetrics
$nodeAApiWebParity = Compare-StringArray -Left $nodeAApi.snapshot.metricsKeys -Right $nodeAWeb.snapshot.metricsKeys
$nodeBApiWebParity = Compare-StringArray -Left $nodeBApi.snapshot.metricsKeys -Right $nodeBWeb.snapshot.metricsKeys
$nodeCApiWebParity = Compare-StringArray -Left $nodeCApi.snapshot.metricsKeys -Right $nodeCWeb.snapshot.metricsKeys

$checks = @(
  (Get-Check -Key "centerRuntimeFreezeAccepted" -Ok:([bool]$centerRuntimeFreeze.accepted) -Actual ([bool]$centerRuntimeFreeze.accepted) -Expected $true),
  (Get-Check -Key "centerRuntimeFreezeBoundary" -Ok:([string]$centerRuntimeFreeze.currentBoundary -eq "center-runtime-freeze-ready") -Actual ([string]$centerRuntimeFreeze.currentBoundary) -Expected "center-runtime-freeze-ready"),
  (Get-Check -Key "rk3568ProductionOperationalReady" -Ok:([bool]$productionOperational.ready) -Actual ([bool]$productionOperational.ready) -Expected $true),
  (Get-Check -Key "rk3568ProductionServiceActive" -Ok:([bool]$productionOperational.serviceActive) -Actual ([string]$productionRuntime.serviceActive) -Expected "active"),
  (Get-Check -Key "rk3568ProductionMqttConnected" -Ok:([bool]$productionOperational.mqttConnected) -Actual ([bool]$productionRuntime.mqttConnected) -Expected $true),
  (Get-Check -Key "rk3568ProductionSerialOpen" -Ok:([bool]$productionOperational.serialOpen) -Actual ([bool]$productionRuntime.serialOpen) -Expected $true),
  (Get-Check -Key "rk3568ProductionSpoolPendingZero" -Ok:([bool]$productionOperational.spoolPendingZero) -Actual ([int]$productionRuntime.spoolPending) -Expected 0),
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
  (Get-Check -Key "nodeCApiPassed" -Ok:([bool]$nodeCApi.check.passed) -Actual ([bool]$nodeCApi.check.passed) -Expected $true),
  (Get-Check -Key "nodeCApiMetricsContract" -Ok:([bool]$nodeCApi.check.metricsContractOk -and $nodeCMetricsMatchExpected) -Actual ([int]$nodeCApi.snapshot.metricsKeyCount) -Expected ($expectedMetrics.Count)),
  (Get-Check -Key "nodeCWebPassed" -Ok:([bool]$nodeCWeb.check.passed) -Actual ([bool]$nodeCWeb.check.passed) -Expected $true),
  (Get-Check -Key "nodeCWebMetricsContract" -Ok:([bool]$nodeCWeb.check.metricsContractOk -and $nodeCWebMetricsMatchExpected) -Actual ([int]$nodeCWeb.snapshot.metricsKeyCount) -Expected ($expectedMetrics.Count)),
  (Get-Check -Key "nodeCApiWebParity" -Ok:$nodeCApiWebParity -Actual ($nodeCApi.snapshot.metricsKeyCount) -Expected ($nodeCWeb.snapshot.metricsKeyCount)),
  (Get-Check -Key "webDevicesApiUsesDevicesEndpoint" -Ok:(Test-TextContains -Text $webDevicesApiText -Pattern "/api/v1/devices?") -Actual (Test-TextContains -Text $webDevicesApiText -Pattern "/api/v1/devices?") -Expected $true),
  (Get-Check -Key "webDevicesApiUsesStateEndpoint" -Ok:(Test-TextContains -Text $webDevicesApiText -Pattern "/api/v1/data/state/") -Actual (Test-TextContains -Text $webDevicesApiText -Pattern "/api/v1/data/state/") -Expected $true),
  (Get-Check -Key "apiRouteExposesStateEndpoint" -Ok:(Test-TextContains -Text $apiDataRouteText -Pattern '/data/state/:deviceId') -Actual (Test-TextContains -Text $apiDataRouteText -Pattern '/data/state/:deviceId') -Expected $true),
  (Get-Check -Key "apiRouteUsesDeviceState" -Ok:(Test-TextContains -Text $apiDataRouteText -Pattern 'FROM device_state') -Actual (Test-TextContains -Text $apiDataRouteText -Pattern 'FROM device_state') -Expected $true),
  (Get-Check -Key "apiReadmeMentionsStateEndpoint" -Ok:(Test-TextContains -Text $apiReadmeText -Pattern 'GET /api/v1/data/state/{deviceId}') -Actual (Test-TextContains -Text $apiReadmeText -Pattern 'GET /api/v1/data/state/{deviceId}') -Expected $true)
)

$strictAccepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
$strictFailureKeys = @($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })

$requiredNodeFailures = New-Object System.Collections.Generic.List[string]
if (-not ([bool]$nodeAApi.check.passed -and [bool]$nodeAWeb.check.passed -and $nodeAApiWebParity -and [bool]$nodeAApi.check.metricsContractOk -and [bool]$nodeAWeb.check.metricsContractOk)) {
  $requiredNodeFailures.Add("nodeA")
}
if (-not ([bool]$nodeBApi.check.passed -and [bool]$nodeBWeb.check.passed -and $nodeBApiWebParity -and [bool]$nodeBApi.check.metricsContractOk -and [bool]$nodeBWeb.check.metricsContractOk)) {
  $requiredNodeFailures.Add("nodeB")
}

$pendingNodeOutstanding = New-Object System.Collections.Generic.List[string]
if (-not ([bool]$nodeCApi.check.passed -and [bool]$nodeCWeb.check.passed -and $nodeCApiWebParity -and [bool]$nodeCApi.check.metricsContractOk -and [bool]$nodeCWeb.check.metricsContractOk)) {
  $pendingNodeOutstanding.Add("nodeC")
}

$productionOperationalReadyForMainline = (
  [bool]$productionOperational.serviceActive -and
  [bool]$productionOperational.mqttConnected -and
  [bool]$productionOperational.serialOpen -and
  [bool]$productionOperational.rejectedWriteFailuresZero -and
  [bool]$productionOperational.spoolPendingZero -and
  [bool]$productionOperational.nodeAOperational -and
  [bool]$productionOperational.nodeBOperational
)

$operationalChecks = @(
  (Get-Check -Key "centerRuntimeFreezeAccepted" -Ok:([bool]$centerRuntimeFreeze.accepted) -Actual ([bool]$centerRuntimeFreeze.accepted) -Expected $true),
  (Get-Check -Key "centerRuntimeFreezeBoundary" -Ok:([string]$centerRuntimeFreeze.currentBoundary -eq "center-runtime-freeze-ready") -Actual ([string]$centerRuntimeFreeze.currentBoundary) -Expected "center-runtime-freeze-ready"),
  (Get-Check -Key "rk3568ProductionOperationalReady" -Ok:$productionOperationalReadyForMainline -Actual $productionOperationalReadyForMainline -Expected $true),
  (Get-Check -Key "requiredNodesLive" -Ok:($requiredNodeFailures.Count -eq 0) -Actual @($requiredNodeFailures) -Expected @()),
  (Get-Check -Key "pendingNodesTracked" -Ok:$true -Actual @($pendingNodeOutstanding) -Expected "tracked-as-pending"),
  (Get-Check -Key "webDevicesApiUsesDevicesEndpoint" -Ok:(Test-TextContains -Text $webDevicesApiText -Pattern "/api/v1/devices?") -Actual (Test-TextContains -Text $webDevicesApiText -Pattern "/api/v1/devices?") -Expected $true),
  (Get-Check -Key "webDevicesApiUsesStateEndpoint" -Ok:(Test-TextContains -Text $webDevicesApiText -Pattern "/api/v1/data/state/") -Actual (Test-TextContains -Text $webDevicesApiText -Pattern "/api/v1/data/state/") -Expected $true),
  (Get-Check -Key "apiRouteExposesStateEndpoint" -Ok:(Test-TextContains -Text $apiDataRouteText -Pattern '/data/state/:deviceId') -Actual (Test-TextContains -Text $apiDataRouteText -Pattern '/data/state/:deviceId') -Expected $true),
  (Get-Check -Key "apiRouteUsesDeviceState" -Ok:(Test-TextContains -Text $apiDataRouteText -Pattern 'FROM device_state') -Actual (Test-TextContains -Text $apiDataRouteText -Pattern 'FROM device_state') -Expected $true),
  (Get-Check -Key "apiReadmeMentionsStateEndpoint" -Ok:(Test-TextContains -Text $apiReadmeText -Pattern 'GET /api/v1/data/state/{deviceId}') -Actual (Test-TextContains -Text $apiReadmeText -Pattern 'GET /api/v1/data/state/{deviceId}') -Expected $true)
)

$accepted = (@($operationalChecks | Where-Object { -not $_.ok }).Count -eq 0)
$failedKeys = @($operationalChecks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })

$report = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  accepted = $accepted
  operationallyReady = $accepted
  mode = "field-software-read-path-adaptation"
  currentBoundary = if ($accepted) { "software-read-path-adaptation-ready" } else { "software-read-path-adaptation-needs-review" }
  operationalBoundary = if ($accepted) { "software-read-path-adaptation-operational-ready" } else { "software-read-path-adaptation-operational-needs-review" }
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
      operationallyReady = [bool]$productionOperational.ready
      strictFailureKeys = @($productionStrictFailureKeys)
      runtime = [ordered]@{
        serviceActive = [string]$productionRuntime.serviceActive
        mqttConnected = [bool]$productionRuntime.mqttConnected
        serialOpen = [bool]$productionRuntime.serialOpen
        spoolPending = [int]$productionRuntime.spoolPending
        rejectedWriteFailures = [int]$productionRuntime.rejectedWriteFailures
        nodeStatuses = $productionNodeStatuses
      }
    }
    liveClosure = [ordered]@{
      file = $LiveClosureFile.Replace("\", "/")
      accepted = if ($null -ne $liveClosure) { [bool]$liveClosure.accepted } else { $null }
      boundary = if ($null -ne $liveClosure) { [string]$liveClosure.currentBoundary } else { "" }
    }
  }
  liveReadPath = [ordered]@{
    apiBaseUrl = $ApiBaseUrl
    webBaseUrl = $WebBaseUrl
    freshnessSeconds = $FreshnessSeconds
  }
  expectedFieldMetrics = Normalize-StringArray -Items $expectedMetrics
  nodeReadPaths = [ordered]@{
    nodeA = [ordered]@{
      deviceId = $NodeADeviceId
      installLabel = $NodeAInstallLabel
      apiMetricsKeys = Normalize-StringArray -Items @($nodeAApi.snapshot.metricsKeys)
      webMetricsKeys = Normalize-StringArray -Items @($nodeAWeb.snapshot.metricsKeys)
      apiUpdatedAt = [string]$nodeAApi.snapshot.updatedAt
      webUpdatedAt = [string]$nodeAWeb.snapshot.updatedAt
    }
    nodeB = [ordered]@{
      deviceId = $NodeBDeviceId
      installLabel = $NodeBInstallLabel
      apiMetricsKeys = Normalize-StringArray -Items @($nodeBApi.snapshot.metricsKeys)
      webMetricsKeys = Normalize-StringArray -Items @($nodeBWeb.snapshot.metricsKeys)
      apiUpdatedAt = [string]$nodeBApi.snapshot.updatedAt
      webUpdatedAt = [string]$nodeBWeb.snapshot.updatedAt
    }
    nodeC = [ordered]@{
      deviceId = $NodeCDeviceId
      installLabel = $NodeCInstallLabel
      apiMetricsKeys = Normalize-StringArray -Items @($nodeCApi.snapshot.metricsKeys)
      webMetricsKeys = Normalize-StringArray -Items @($nodeCWeb.snapshot.metricsKeys)
      apiUpdatedAt = [string]$nodeCApi.snapshot.updatedAt
      webUpdatedAt = [string]$nodeCWeb.snapshot.updatedAt
    }
  }
  staticBindings = [ordered]@{
    webDevicesApiFile = $WebDevicesApiFile.Replace("\", "/")
    apiDataRouteFile = $ApiDataRouteFile.Replace("\", "/")
    apiReadmeFile = $ApiReadmeFile.Replace("\", "/")
  }
  strictAttention = [ordered]@{
    strictAccepted = $strictAccepted
    strictBoundary = if ($strictAccepted) { "software-read-path-adaptation-strict-ready" } else { "software-read-path-adaptation-strict-needs-review" }
    rk3568ProductionFreezeAccepted = [bool]$rk3568ProductionFreeze.accepted
    rk3568ProductionFreezeBoundary = [string]$rk3568ProductionFreeze.currentBoundary
    failureKeys = @($strictFailureKeys)
    productionFreezeFailureKeys = @($productionStrictFailureKeys)
    summary = if ($strictAccepted) { "strict-read-path-ready" } else { "operational-read-path-ready-but-strict-node-coverage-still-needs-review" }
  }
  operationalSummary = [ordered]@{
    requiredNodeKeys = @("nodeA", "nodeB")
    pendingNodeKeys = @("nodeC")
    requiredNodeFailures = @($requiredNodeFailures)
    pendingNodeOutstanding = @($pendingNodeOutstanding)
    note = "top-level acceptance follows the AB mainline; node C remains explicitly tracked as pending"
  }
  failureKeys = $failedKeys
  strictFailureKeys = @($strictFailureKeys)
  nextUse = @(
    "refresh software read-path adaptation: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-software-read-path-adaptation.ps1",
    "refresh live closure baseline: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-center-live-closure.ps1 -BoardPassword <password> -AllowUnsafeSecrets",
    "refresh rk3568 uplink freeze: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-production-uplink-freeze.ps1 -Password <password>"
  )
  checks = $operationalChecks
  strictChecks = $checks
}

$outDir = Split-Path -Parent $resolvedOutFile
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$json = $report | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $resolvedOutFile -Value $json -Encoding UTF8
$json
