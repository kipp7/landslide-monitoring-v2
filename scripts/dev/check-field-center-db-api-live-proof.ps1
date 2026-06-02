[CmdletBinding()]
param(
  [string]$ApiBaseUrl = "http://127.0.0.1:8080",
  [string]$WebBaseUrl = "http://127.0.0.1:3000",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [int]$FreshnessSeconds = 180,
  [int]$ClickHouseWindowMinutes = 30,
  [string[]]$RequiredNodeKeys = @("nodeA", "nodeB"),
  [string[]]$PendingNodeKeys = @("nodeC"),
  [string]$DeskProductionHandoffFile = "docs/unified/reports/desk-win-production-handoff-latest.json",
  [string]$SoftwareReadPathFile = "docs/unified/reports/field-software-read-path-adaptation-latest.json",
  [string]$OutJsonFile = "docs/unified/reports/field-center-db-api-live-proof-latest.json",
  [string]$OutMdFile = "docs/unified/reports/field-center-db-api-live-proof-latest.md"
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

$Nodes = @(
  [pscustomobject]@{ key = "nodeA"; deviceId = "00000000-0000-0000-0000-000000000001"; installLabel = "FIELD-NODE-A"; legacyNode = "A" },
  [pscustomobject]@{ key = "nodeB"; deviceId = "00000000-0000-0000-0000-000000000002"; installLabel = "FIELD-NODE-B"; legacyNode = "B" },
  [pscustomobject]@{ key = "nodeC"; deviceId = "00000000-0000-0000-0000-000000000003"; installLabel = "FIELD-NODE-C"; legacyNode = "C" }
)

function New-Utf8NoBomEncoding {
  return New-Object System.Text.UTF8Encoding($false)
}

function Write-Utf8NoBomFile {
  param(
    [string]$Path,
    [string]$Value
  )

  [System.IO.File]::WriteAllText($Path, $Value, (New-Utf8NoBomEncoding))
}

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

function Convert-ToUtcDateTime {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  return ([DateTimeOffset]::Parse($Text)).UtcDateTime
}

function Get-AgeSeconds {
  param([string]$Text)

  $utc = Convert-ToUtcDateTime -Text $Text
  if ($null -eq $utc) {
    return $null
  }

  return [Math]::Round(((Get-Date).ToUniversalTime() - $utc).TotalSeconds, 3)
}

function Normalize-StringArray {
  param([object[]]$Items)

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

  return [pscustomobject]@{
    baseUrl = $BaseUrl.TrimEnd("/")
    headers = @{
      Accept = "application/json"
      Authorization = "Bearer $token"
    }
  }
}

function Get-ApiState {
  param(
    $Session,
    [string]$DeviceId
  )

  return Invoke-RestMethod -Uri ($Session.baseUrl + "/api/v1/data/state/" + [uri]::EscapeDataString($DeviceId)) -Method Get -Headers $Session.headers
}

function Invoke-PostgresJsonQuery {
  param([string]$Sql)

  $raw = $Sql | docker exec -i lsmv2_postgres sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'
  $lines = @($raw | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  return @($lines | ForEach-Object { $_ | ConvertFrom-Json })
}

function Invoke-ClickHouseJsonEachRowQuery {
  param([string]$Sql)

  $raw = $Sql | docker exec -i lsmv2_clickhouse sh -lc 'clickhouse-client --multiquery'
  $lines = @($raw | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  return @($lines | ForEach-Object { $_ | ConvertFrom-Json })
}

function Get-NodeApiSnapshot {
  param(
    $Session,
    $Node
  )

  $resp = Get-ApiState -Session $Session -DeviceId $Node.deviceId
  $state = $resp.data.state
  $metricsKeys = if ($state.metrics) { @($state.metrics.PSObject.Properties.Name) } else { @() }
  $installLabel = if ($state.meta -and $null -ne $state.meta.PSObject.Properties["install_label"]) { [string]$state.meta.install_label } else { "" }
  $updatedAt = [string]$resp.data.updatedAt

  return [ordered]@{
    updatedAt = $updatedAt
    updatedAtAgeSeconds = Get-AgeSeconds -Text $updatedAt
    installLabel = $installLabel
    metricsKeys = Normalize-StringArray -Items $metricsKeys
    metricsKeyCount = $metricsKeys.Count
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

function Get-NodeCheckMap {
  param(
    [object[]]$Items
  )

  $map = @{}
  foreach ($item in $Items) {
    $map[[string]$item.key] = $item
  }
  return $map
}

$repoRoot = Resolve-RepoRoot
$resolvedDeskProductionHandoffFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $DeskProductionHandoffFile
$resolvedSoftwareReadPathFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $SoftwareReadPathFile
$resolvedOutJsonFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutJsonFile
$resolvedOutMdFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutMdFile

$deskProductionHandoff = Read-JsonFile -Path $resolvedDeskProductionHandoffFile -Label "Desk production handoff"
$softwareReadPath = Read-JsonFile -Path $resolvedSoftwareReadPathFile -Label "Software read-path latest"
$softwareReadPathOperationalReady = if ($softwareReadPath.PSObject.Properties.Name -contains "operationallyReady") { [bool]$softwareReadPath.operationallyReady } else { [bool]$softwareReadPath.accepted }
$softwareReadPathOperationalBoundary = if ($softwareReadPath.PSObject.Properties.Name -contains "operationalBoundary") { [string]$softwareReadPath.operationalBoundary } else { [string]$softwareReadPath.currentBoundary }

$nodeMap = @{}
foreach ($node in $Nodes) {
  $nodeMap[[string]$node.key] = $node
}

foreach ($nodeKey in @($RequiredNodeKeys + $PendingNodeKeys)) {
  if (-not $nodeMap.ContainsKey([string]$nodeKey)) {
    throw "Unknown node key in RequiredNodeKeys/PendingNodeKeys: $nodeKey"
  }
}

$apiSession = New-AuthSession -BaseUrl $ApiBaseUrl -UserNameValue $Username -PasswordValue $Password
$webSession = New-AuthSession -BaseUrl $WebBaseUrl -UserNameValue $Username -PasswordValue $Password

$quotedDeviceIdsSql = ($Nodes | ForEach-Object { "'$($_.deviceId)'" }) -join ","
$postgresRows = Invoke-PostgresJsonQuery -Sql @"
SELECT row_to_json(x)
FROM (
  SELECT
    device_id,
    to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
    state
  FROM device_state
  WHERE device_id IN ($quotedDeviceIdsSql)
  ORDER BY device_id
) x;
"@
$clickhouseRows = Invoke-ClickHouseJsonEachRowQuery -Sql @"
SELECT
  device_id,
  toString(max(received_ts)) AS last_received_ts,
  count() AS rows_window
FROM landslide.telemetry_raw
WHERE received_ts >= now() - INTERVAL $ClickHouseWindowMinutes MINUTE
  AND device_id IN ($quotedDeviceIdsSql)
GROUP BY device_id
ORDER BY device_id
FORMAT JSONEachRow
"@

$postgresByDevice = @{}
foreach ($row in $postgresRows) {
  $postgresByDevice[[string]$row.device_id] = $row
}

$clickhouseByDevice = @{}
foreach ($row in $clickhouseRows) {
  $clickhouseByDevice[[string]$row.device_id] = $row
}

$nodeResults = [ordered]@{}
$checks = New-Object System.Collections.Generic.List[object]
$nodeGateStatus = [ordered]@{}

foreach ($node in $Nodes) {
  $apiSnapshot = Get-NodeApiSnapshot -Session $apiSession -Node $node
  $webSnapshot = Get-NodeApiSnapshot -Session $webSession -Node $node

  $pgRow = if ($postgresByDevice.ContainsKey($node.deviceId)) { $postgresByDevice[$node.deviceId] } else { $null }
  $pgMetricsKeys = @()
  $pgInstallLabel = ""
  $pgUpdatedAt = ""
  if ($null -ne $pgRow) {
    $pgMetricsKeys = if ($pgRow.state.metrics) { @($pgRow.state.metrics.PSObject.Properties.Name) } else { @() }
    if ($pgRow.state.meta -and $null -ne $pgRow.state.meta.PSObject.Properties["install_label"]) {
      $pgInstallLabel = [string]$pgRow.state.meta.install_label
    }
    $pgUpdatedAt = [string]$pgRow.updated_at
  }

  $chRow = if ($clickhouseByDevice.ContainsKey($node.deviceId)) { $clickhouseByDevice[$node.deviceId] } else { $null }
  $chUpdatedAt = if ($null -ne $chRow) { ([string]$chRow.last_received_ts).Replace(" ", "T") + "Z" } else { "" }

  $pgFresh = ($null -ne $pgRow) -and ((Get-AgeSeconds -Text $pgUpdatedAt) -le $FreshnessSeconds)
  $apiFresh = ($null -ne $apiSnapshot.updatedAtAgeSeconds) -and ([double]$apiSnapshot.updatedAtAgeSeconds -le $FreshnessSeconds)
  $webFresh = ($null -ne $webSnapshot.updatedAtAgeSeconds) -and ([double]$webSnapshot.updatedAtAgeSeconds -le $FreshnessSeconds)
  $chFresh = $false
  if ($null -ne $chRow) {
    $chAge = Get-AgeSeconds -Text $chUpdatedAt
    $chFresh = ($null -ne $chAge) -and ([double]$chAge -le $FreshnessSeconds)
  }

  $pgMetricsNorm = Normalize-StringArray -Items $pgMetricsKeys
  $apiMetricsNorm = Normalize-StringArray -Items $apiSnapshot.metricsKeys
  $webMetricsNorm = Normalize-StringArray -Items $webSnapshot.metricsKeys

  $nodeResults[$node.key] = [ordered]@{
    deviceId = $node.deviceId
    installLabel = $node.installLabel
    postgres = [ordered]@{
      present = ($null -ne $pgRow)
      updatedAt = $pgUpdatedAt
      updatedAtAgeSeconds = Get-AgeSeconds -Text $pgUpdatedAt
      fresh = $pgFresh
      installLabel = $pgInstallLabel
      metricsKeys = $pgMetricsNorm
      metricsKeyCount = $pgMetricsNorm.Count
    }
    clickhouse = [ordered]@{
      present = ($null -ne $chRow)
      lastReceivedTs = $chUpdatedAt
      lastReceivedAgeSeconds = Get-AgeSeconds -Text $chUpdatedAt
      fresh = $chFresh
      rowsWindow = if ($null -ne $chRow) { [int]$chRow.rows_window } else { 0 }
      windowMinutes = $ClickHouseWindowMinutes
    }
    api = $apiSnapshot
    web = $webSnapshot
  }

  $nodeGateStatus[$node.key] = [ordered]@{
    postgresPresent = ($null -ne $pgRow)
    postgresFresh = $pgFresh
    clickhousePresent = ($null -ne $chRow)
    clickhouseFresh = $chFresh
    apiFresh = $apiFresh
    webFresh = $webFresh
    apiMetricsContract = (Compare-StringArray -Left $apiMetricsNorm -Right $ExpectedFieldMetrics)
    webMetricsContract = (Compare-StringArray -Left $webMetricsNorm -Right $ExpectedFieldMetrics)
    postgresMetricsContract = (Compare-StringArray -Left $pgMetricsNorm -Right $ExpectedFieldMetrics)
  }

  $checks.Add((Get-Check -Key ($node.key + "PostgresPresent") -Ok:($null -ne $pgRow) -Actual ($null -ne $pgRow) -Expected $true))
  $checks.Add((Get-Check -Key ($node.key + "PostgresFresh") -Ok:$pgFresh -Actual (Get-AgeSeconds -Text $pgUpdatedAt) -Expected ("<= {0}" -f $FreshnessSeconds)))
  $checks.Add((Get-Check -Key ($node.key + "ClickHousePresent") -Ok:($null -ne $chRow) -Actual ($null -ne $chRow) -Expected $true))
  $checks.Add((Get-Check -Key ($node.key + "ClickHouseFresh") -Ok:$chFresh -Actual (Get-AgeSeconds -Text $chUpdatedAt) -Expected ("<= {0}" -f $FreshnessSeconds)))
  $checks.Add((Get-Check -Key ($node.key + "ApiFresh") -Ok:$apiFresh -Actual $apiSnapshot.updatedAtAgeSeconds -Expected ("<= {0}" -f $FreshnessSeconds)))
  $checks.Add((Get-Check -Key ($node.key + "WebFresh") -Ok:$webFresh -Actual $webSnapshot.updatedAtAgeSeconds -Expected ("<= {0}" -f $FreshnessSeconds)))
  $checks.Add((Get-Check -Key ($node.key + "ApiMetricsContract") -Ok:(Compare-StringArray -Left $apiMetricsNorm -Right $ExpectedFieldMetrics) -Actual $apiMetricsNorm.Count -Expected $ExpectedFieldMetrics.Count))
  $checks.Add((Get-Check -Key ($node.key + "WebMetricsContract") -Ok:(Compare-StringArray -Left $webMetricsNorm -Right $ExpectedFieldMetrics) -Actual $webMetricsNorm.Count -Expected $ExpectedFieldMetrics.Count))
  $checks.Add((Get-Check -Key ($node.key + "PostgresMetricsContract") -Ok:(Compare-StringArray -Left $pgMetricsNorm -Right $ExpectedFieldMetrics) -Actual $pgMetricsNorm.Count -Expected $ExpectedFieldMetrics.Count))
}

$checks.Add((Get-Check -Key "deskProductionHandoffReady" -Ok:([bool]$deskProductionHandoff.ready) -Actual ([bool]$deskProductionHandoff.ready) -Expected $true))
$checks.Add((Get-Check -Key "softwareReadPathLatestOperationallyReady" -Ok:$softwareReadPathOperationalReady -Actual $softwareReadPathOperationalReady -Expected $true))

$failedChecks = @($checks | Where-Object { -not $_.ok })
$accepted = ($failedChecks.Count -eq 0)
$checkMap = Get-NodeCheckMap -Items $checks

$requiredNodeKeysNorm = @($RequiredNodeKeys | ForEach-Object { [string]$_ } | Sort-Object -Unique)
$pendingNodeKeysNorm = @($PendingNodeKeys | ForEach-Object { [string]$_ } | Sort-Object -Unique)
$requiredNodeFailures = New-Object System.Collections.Generic.List[string]
$pendingNodeOutstanding = New-Object System.Collections.Generic.List[string]

foreach ($nodeKey in $requiredNodeKeysNorm) {
  $gate = $nodeGateStatus[$nodeKey]
  $requiredPassed =
    [bool]$gate.postgresPresent -and
    [bool]$gate.postgresFresh -and
    [bool]$gate.clickhousePresent -and
    [bool]$gate.clickhouseFresh -and
    [bool]$gate.apiFresh -and
    [bool]$gate.webFresh -and
    [bool]$gate.apiMetricsContract -and
    [bool]$gate.webMetricsContract -and
    [bool]$gate.postgresMetricsContract
  if (-not $requiredPassed) {
    $requiredNodeFailures.Add($nodeKey)
  }
}

foreach ($nodeKey in $pendingNodeKeysNorm) {
  $gate = $nodeGateStatus[$nodeKey]
  $pendingPassed =
    [bool]$gate.postgresPresent -and
    [bool]$gate.postgresFresh -and
    [bool]$gate.clickhousePresent -and
    [bool]$gate.clickhouseFresh -and
    [bool]$gate.apiFresh -and
    [bool]$gate.webFresh -and
    [bool]$gate.apiMetricsContract -and
    [bool]$gate.webMetricsContract -and
    [bool]$gate.postgresMetricsContract
  if (-not $pendingPassed) {
    $pendingNodeOutstanding.Add($nodeKey)
  }
}

$operationalChecks = @(
  (Get-Check -Key "deskProductionHandoffReadyForOperations" -Ok:([bool]$deskProductionHandoff.ready) -Actual ([bool]$deskProductionHandoff.ready) -Expected $true),
  (Get-Check -Key "requiredNodesLive" -Ok:($requiredNodeFailures.Count -eq 0) -Actual @($requiredNodeFailures) -Expected @()),
  (Get-Check -Key "pendingNodesTracked" -Ok:$true -Actual @($pendingNodeOutstanding) -Expected "tracked-as-pending")
)

$operationalFailedChecks = @($operationalChecks | Where-Object { -not $_.ok })
$operationallyReady = ($operationalFailedChecks.Count -eq 0)
$operationalBoundary = if ($operationallyReady) {
  "field-center-db-api-live-proof-operational-ready"
} else {
  "field-center-db-api-live-proof-operational-needs-review"
}

$report = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  accepted = $accepted
  operationallyReady = $operationallyReady
  mode = "field-center-db-api-live-proof"
  currentBoundary = if ($accepted) { "field-center-db-api-live-proof-ready" } else { "field-center-db-api-live-proof-needs-review" }
  operationalBoundary = $operationalBoundary
  environment = [ordered]@{
    apiBaseUrl = $ApiBaseUrl
    webBaseUrl = $WebBaseUrl
    freshnessSeconds = $FreshnessSeconds
    clickhouseWindowMinutes = $ClickHouseWindowMinutes
    requiredNodeKeys = $requiredNodeKeysNorm
    pendingNodeKeys = $pendingNodeKeysNorm
  }
  baselines = [ordered]@{
    deskProductionHandoff = [ordered]@{
      file = $DeskProductionHandoffFile.Replace("\", "/")
      ready = [bool]$deskProductionHandoff.ready
      latestPackageDir = [string]$deskProductionHandoff.latest.packageDir
    }
    softwareReadPath = [ordered]@{
      file = $SoftwareReadPathFile.Replace("\", "/")
      accepted = [bool]$softwareReadPath.accepted
      operationallyReady = $softwareReadPathOperationalReady
      boundary = [string]$softwareReadPath.currentBoundary
      operationalBoundary = $softwareReadPathOperationalBoundary
      generatedAt = [string]$softwareReadPath.generatedAt
    }
  }
  expectedFieldMetrics = $ExpectedFieldMetrics
  nodes = $nodeResults
  operationalSummary = [ordered]@{
    requiredNodeKeys = $requiredNodeKeysNorm
    pendingNodeKeys = $pendingNodeKeysNorm
    requiredNodeFailures = @($requiredNodeFailures)
    pendingNodeOutstanding = @($pendingNodeOutstanding)
    softwareReadPathAccepted = [bool]$softwareReadPath.accepted
    softwareReadPathOperationallyReady = $softwareReadPathOperationalReady
    softwareReadPathBoundary = [string]$softwareReadPath.currentBoundary
    softwareReadPathOperationalBoundary = $softwareReadPathOperationalBoundary
    note = "strict acceptance still requires every node and latest read-path baseline to pass; operational readiness only requires required nodes to be live while pending nodes remain explicitly tracked"
  }
  failureKeys = @($failedChecks | ForEach-Object { $_.key })
  operationalFailureKeys = @($operationalFailedChecks | ForEach-Object { $_.key })
  nextUse = @(
    "refresh db/api live proof: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-db-api-live-proof.ps1",
    "refresh software read-path latest: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-software-read-path-adaptation.ps1",
    "refresh rk3568 runtime snapshot: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-field-gateway-runtime.ps1 -Password <password>",
    "refresh rk3568 production uplink freeze: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-production-uplink-freeze.ps1 -Password <password>"
  )
  checks = $checks
  operationalChecks = $operationalChecks
}

$jsonDir = Split-Path -Parent $resolvedOutJsonFile
if ($jsonDir -and -not (Test-Path -LiteralPath $jsonDir)) {
  New-Item -ItemType Directory -Path $jsonDir -Force | Out-Null
}

$json = $report | ConvertTo-Json -Depth 10
Write-Utf8NoBomFile -Path $resolvedOutJsonFile -Value $json

$mdLines = @(
  "# Field Center DB/API Live Proof",
  "",
  "- generatedAt: ``$($report.generatedAt)``",
  "- accepted: ``$($report.accepted.ToString().ToLower())``",
  "- operationallyReady: ``$($report.operationallyReady.ToString().ToLower())``",
  "- currentBoundary: ``$($report.currentBoundary)``",
  "- operationalBoundary: ``$($report.operationalBoundary)``",
  "",
  "## Summary",
  ""
)

foreach ($node in $Nodes) {
  $item = $report.nodes[$node.key]
  $apiFresh = ($null -ne $item.api.updatedAtAgeSeconds) -and ([double]$item.api.updatedAtAgeSeconds -le $FreshnessSeconds)
  $webFresh = ($null -ne $item.web.updatedAtAgeSeconds) -and ([double]$item.web.updatedAtAgeSeconds -le $FreshnessSeconds)
  $mdLines += "- ``$($node.key)`` postgres fresh=$($item.postgres.fresh) clickhouse fresh=$($item.clickhouse.fresh) api fresh=$apiFresh web fresh=$webFresh"
}

$mdLines += @(
  "",
  "## Operational Summary",
  "",
  "- requiredNodeKeys: ``$($requiredNodeKeysNorm -join ',')``",
  "- pendingNodeKeys: ``$($pendingNodeKeysNorm -join ',')``",
  "- requiredNodeFailures: ``$((@($requiredNodeFailures) -join ','))``",
  "- pendingNodeOutstanding: ``$((@($pendingNodeOutstanding) -join ','))``",
  "",
  "## Failure Keys",
  ""
)

if ($report.failureKeys.Count -eq 0) {
  $mdLines += "- none"
} else {
  foreach ($key in $report.failureKeys) {
    $mdLines += "- ``$key``"
  }
}

$mdDir = Split-Path -Parent $resolvedOutMdFile
if ($mdDir -and -not (Test-Path -LiteralPath $mdDir)) {
  New-Item -ItemType Directory -Path $mdDir -Force | Out-Null
}
Write-Utf8NoBomFile -Path $resolvedOutMdFile -Value ($mdLines -join [Environment]::NewLine)

$json
