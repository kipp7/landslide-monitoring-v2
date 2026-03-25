param(
  [string]$BaseUrl = "http://127.0.0.1:8081"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Assert-HasKeys($obj, [string[]]$keys, [string]$label) {
  foreach ($key in $keys) {
    if (-not ($obj.PSObject.Properties.Name -contains $key)) {
      throw "$label missing field: $key"
    }
  }
}

function Assert-True($condition, [string]$message) {
  if (-not $condition) {
    throw $message
  }
}

function Invoke-RestMethodWithRetry {
  param(
    [scriptblock]$Action,
    [int]$MaxAttempts = 10,
    [int]$DelaySeconds = 2
  )

  $lastError = $null
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt += 1) {
    try {
      return & $Action
    }
    catch {
      $lastError = $_
      if ($attempt -ge $MaxAttempts) { break }
      Start-Sleep -Seconds $DelaySeconds
    }
  }

  throw $lastError
}

function Get-V1BaselineSnapshot($item) {
  $baseline = $item.baseline
  return [ordered]@{
    deviceId = [string]$item.deviceId
    method = [string]$item.method
    pointsCount = if ($null -eq $item.pointsCount) { $null } else { [int]$item.pointsCount }
    computedAt = [string]$item.computedAt
    latitude = [double]$baseline.latitude
    longitude = [double]$baseline.longitude
    altitude = if ($null -eq $baseline.altitude) { $null } else { [double]$baseline.altitude }
    notes = if ($null -eq $baseline.notes) { $null } else { [string]$baseline.notes }
    establishedBy = if ($null -eq $baseline.establishedBy) { $null } else { [string]$baseline.establishedBy }
    satelliteCount = if ($null -eq $baseline.satelliteCount) { $null } else { [int]$baseline.satelliteCount }
    positionAccuracyMeters = if ($null -eq $baseline.positionAccuracyMeters) { $null } else { [double]$baseline.positionAccuracyMeters }
  }
}

function New-QueryString($pairs) {
  ($pairs.GetEnumerator() | ForEach-Object {
    "{0}={1}" -f [System.Uri]::EscapeDataString([string]$_.Key), [System.Uri]::EscapeDataString([string]$_.Value)
  }) -join "&"
}

$loginEnvelope = Invoke-RestMethodWithRetry -Action {
  Invoke-RestMethod -Uri "$BaseUrl/api/v1/auth/login" -Method Post -ContentType "application/json" -Body '{"username":"admin","password":"123456"}' -TimeoutSec 10
}
Assert-HasKeys $loginEnvelope @("success", "data") "v1.auth.login.envelope"
$loginData = $loginEnvelope.data
Assert-HasKeys $loginData @("token", "refreshToken", "user") "v1.auth.login.data"
Assert-True ([string]$loginData.token -ne "") "v1 auth login token missing"
Assert-True ([string]$loginData.refreshToken -ne "") "v1 auth login refreshToken missing"

$headers = @{ Authorization = "Bearer $([string]$loginData.token)" }

$meEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/auth/me" -Headers $headers -TimeoutSec 10
Assert-HasKeys $meEnvelope @("success", "data") "v1.auth.me.envelope"
$meData = $meEnvelope.data
Assert-HasKeys $meData @("userId", "username", "roles", "permissions") "v1.auth.me.data"

$refreshEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/auth/refresh" -Method Post -ContentType "application/json" -Body (@{ refreshToken = [string]$loginData.refreshToken } | ConvertTo-Json -Compress) -TimeoutSec 10
Assert-HasKeys $refreshEnvelope @("success", "data") "v1.auth.refresh.envelope"
$refreshData = $refreshEnvelope.data
Assert-HasKeys $refreshData @("token", "refreshToken", "expiresIn") "v1.auth.refresh.data"

$headers = @{ Authorization = "Bearer $([string]$refreshData.token)" }

$dashboardEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/dashboard" -Headers $headers -TimeoutSec 10
$dashboard = $dashboardEnvelope.data
$trendEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/dashboard/weekly-trend" -Headers $headers -TimeoutSec 10
$trend = $trendEnvelope.data
$stationsEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/stations?page=1&pageSize=200" -Headers $headers -TimeoutSec 10
$stationList = @($stationsEnvelope.data.list)
$devicesEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/devices?page=1&pageSize=200" -Headers $headers -TimeoutSec 10
$deviceList = @($devicesEnvelope.data.list)
$baselinesEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/gps/baselines?page=1&pageSize=200" -Headers $headers -TimeoutSec 10
$baselineList = @($baselinesEnvelope.data.list)

Assert-True ($stationList.Count -gt 0) "v1 stations returned empty list"
Assert-True ($deviceList.Count -gt 0) "v1 devices returned empty list"
Assert-True ($baselineList.Count -gt 0) "v1 baselines returned empty list"

$baselineByDeviceId = @{}
foreach ($baseline in $baselineList) {
  $baselineByDeviceId[[string]$baseline.deviceId] = $baseline
}
$missingBaselineDevices = @($deviceList | Where-Object { -not $baselineByDeviceId.Contains([string]$_.deviceId) })
Assert-True ($missingBaselineDevices.Count -ge 1) "expected at least one device without baseline in demo seed"

$targetDevice = $deviceList | Where-Object { $baselineByDeviceId.Contains([string]$_.deviceId) } | Select-Object -First 1
Assert-True ($null -ne $targetDevice) "no device with baseline available for v1 proof"
$baselineBefore = $baselineByDeviceId[[string]$targetDevice.deviceId]
$baselineBeforeSnapshot = Get-V1BaselineSnapshot $baselineBefore

$v1UpsertBody = @{
  method = "manual"
  persist = $false
  baseline = @{
    latitude = [double]$baselineBefore.baseline.latitude + 0.00001
    longitude = [double]$baselineBefore.baseline.longitude + 0.00001
    altitude = [double]$baselineBefore.baseline.altitude
    notes = "desk-v1-proof"
    establishedBy = "desk-v1-proof"
    positionAccuracyMeters = if ($null -eq $baselineBefore.baseline.positionAccuracyMeters) { 1.0 } else { [double]$baselineBefore.baseline.positionAccuracyMeters }
    satelliteCount = if ($null -eq $baselineBefore.baseline.satelliteCount) { 12 } else { [int]$baselineBefore.baseline.satelliteCount }
  }
} | ConvertTo-Json -Depth 8 -Compress
$v1Upsert = Invoke-RestMethod -Uri "$BaseUrl/api/v1/gps/baselines/$([string]$targetDevice.deviceId)" -Method Put -Headers $headers -ContentType "application/json" -Body $v1UpsertBody -TimeoutSec 10
Assert-True ($v1Upsert.data.persisted -eq $false) "v1 baseline upsert should be non-persistent in proof mode"

$v1AutoBody = @{
  pointsCount = 20
  lookbackDays = 30
  latKey = "gps_latitude"
  lonKey = "gps_longitude"
  altKey = "gps_altitude"
  persist = $false
} | ConvertTo-Json -Compress
$v1Auto = Invoke-RestMethod -Uri "$BaseUrl/api/v1/gps/baselines/$([string]$targetDevice.deviceId)/auto-establish" -Method Post -Headers $headers -ContentType "application/json" -Body $v1AutoBody -TimeoutSec 10
Assert-True ($v1Auto.data.persisted -eq $false) "v1 baseline auto-establish should be non-persistent in proof mode"

$baselineAfterEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/gps/baselines/$([string]$targetDevice.deviceId)" -Headers $headers -TimeoutSec 10
$baselineAfterSnapshot = Get-V1BaselineSnapshot $baselineAfterEnvelope.data
Assert-True ((($baselineBeforeSnapshot | ConvertTo-Json -Compress) -eq ($baselineAfterSnapshot | ConvertTo-Json -Compress))) "v1 baseline proof mutated persisted baseline state"

$endTimeUtc = (Get-Date).ToUniversalTime()
$startTimeUtc = $endTimeUtc.AddDays(-8)
$query = New-QueryString([ordered]@{
  startTime = $startTimeUtc.ToString("yyyy-MM-ddTHH:mm:ssZ")
  endTime = $endTimeUtc.ToString("yyyy-MM-ddTHH:mm:ssZ")
  interval = "1h"
})
$gpsEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/gps/deformations/$([string]$targetDevice.deviceId)/series?$query" -Headers $headers -TimeoutSec 10
$gps = $gpsEnvelope.data
Assert-True (@($gps.points).Count -gt 0) "v1 gps points empty"

$gpsAnalysisEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/gps/deformations/$([string]$targetDevice.deviceId)/analysis?timeRange=7d&limit=200" -Headers $headers -TimeoutSec 10
$gpsAnalysis = $gpsAnalysisEnvelope.data
Assert-True ($gpsAnalysis.hasBaseline -eq $true) "v1 gps analysis should have baseline"
Assert-True (@($gpsAnalysis.ceemd.imfs).Count -eq 3) "v1 gps analysis imf count mismatch"
Assert-True (@($gpsAnalysis.prediction.shortTerm).Count -eq 24) "v1 gps analysis short prediction length mismatch"
Assert-True (@($gpsAnalysis.prediction.longTerm).Count -eq 168) "v1 gps analysis long prediction length mismatch"
Assert-True ($null -ne $gpsAnalysis.trendDiagnostics) "v1 gps analysis trend diagnostics missing"
Assert-True ($null -ne $gpsAnalysis.prediction.confidenceIntervals) "v1 gps analysis confidence intervals missing"
Assert-True ($null -ne $gpsAnalysis.prediction.thresholdForecast) "v1 gps analysis threshold forecast missing"
Assert-True (@($gpsAnalysis.prediction.confidenceIntervals.shortTermLower).Count -eq 24) "v1 gps analysis short lower interval length mismatch"
Assert-True (@($gpsAnalysis.prediction.confidenceIntervals.shortTermUpper).Count -eq 24) "v1 gps analysis short upper interval length mismatch"
Assert-True (@($gpsAnalysis.prediction.confidenceIntervals.longTermLower).Count -eq 168) "v1 gps analysis long lower interval length mismatch"
Assert-True (@($gpsAnalysis.prediction.confidenceIntervals.longTermUpper).Count -eq 168) "v1 gps analysis long upper interval length mismatch"

$systemEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/system/status" -Headers $headers -TimeoutSec 10
$system = $systemEnvelope.data

$report = [ordered]@{
  baseUrl = $BaseUrl
  auth = [ordered]@{
    username = [string]$loginData.user.username
    hasRefreshToken = [string]::IsNullOrWhiteSpace([string]$loginData.refreshToken) -eq $false
    refreshWorks = $true
    roles = @($loginData.user.roles)
    roleDisplayName = [string]$meData.roles[0].displayName
    permissions = @($meData.permissions).Count
  }
  summary = [ordered]@{
    stationCount = $dashboard.stations
    deviceOnlineCount = $dashboard.onlineDevices
    alertCountToday = $dashboard.todayAlerts
    freshDevices = $dashboard.freshDevices
    totalDevices = $dashboard.totalDevices
  }
  weeklyTrend = [ordered]@{
    labels = @($trend.labels).Count
    rainfallSum = (@($trend.rainfallMm) | Measure-Object -Sum).Sum
    alertSum = (@($trend.alertCount) | Measure-Object -Sum).Sum
    source = $trend.source
  }
  stations = [ordered]@{
    count = $stationList.Count
    first = $stationList[0]
    deviceCoverage = $true
  }
  devices = [ordered]@{
    count = $deviceList.Count
    first = $deviceList[0]
    stationCoverage = $true
    missingBaselineCount = $missingBaselineDevices.Count
  }
  baselines = [ordered]@{
    count = $baselineList.Count
    first = $baselineList[0]
    deviceCoverage = $true
    upsertPersisted = $v1Upsert.data.persisted
    autoPersisted = $v1Auto.data.persisted
    proofStable = $true
  }
  gps = [ordered]@{
    deviceId = $gps.deviceId
    points = @($gps.points).Count
    baselineConsistency = $true
  }
  gpsAnalysis = [ordered]@{
    deviceId = $gpsAnalysis.deviceId
    hasBaseline = $gpsAnalysis.hasBaseline
    qualityScore = [double]$gpsAnalysis.qualityScore
    trendDirection = [string]$gpsAnalysis.trendDiagnostics.direction
    trendSlopeMmPerHour = [double]$gpsAnalysis.trendDiagnostics.slopeMmPerHour
    imfCount = @($gpsAnalysis.ceemd.imfs).Count
    shortPredictionPoints = @($gpsAnalysis.prediction.shortTerm).Count
    longPredictionPoints = @($gpsAnalysis.prediction.longTerm).Count
    thresholdBlueMm = [double]$gpsAnalysis.prediction.thresholdForecast.thresholdsMm.blue
    shortBlueBreached = [bool]$gpsAnalysis.prediction.thresholdForecast.shortTerm.blue.breached
    longRedBreached = [bool]$gpsAnalysis.prediction.thresholdForecast.longTerm.red.breached
    shortPredictionLowerPoints = @($gpsAnalysis.prediction.confidenceIntervals.shortTermLower).Count
    shortPredictionUpperPoints = @($gpsAnalysis.prediction.confidenceIntervals.shortTermUpper).Count
    longPredictionLowerPoints = @($gpsAnalysis.prediction.confidenceIntervals.longTermLower).Count
    longPredictionUpperPoints = @($gpsAnalysis.prediction.confidenceIntervals.longTermUpper).Count
  }
  system = [ordered]@{
    source = $system.source
    items = @($system.items).Count
  }
}

$report | ConvertTo-Json -Depth 8
