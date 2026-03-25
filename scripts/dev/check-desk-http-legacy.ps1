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

function Get-BaselineSnapshot($baseline) {
  return [ordered]@{
    device_id = [string]$baseline.device_id
    baseline_latitude = [double]$baseline.baseline_latitude
    baseline_longitude = [double]$baseline.baseline_longitude
    baseline_altitude = if ($null -eq $baseline.baseline_altitude) { $null } else { [double]$baseline.baseline_altitude }
    established_by = [string]$baseline.established_by
    established_time = [string]$baseline.established_time
    notes = if ($null -eq $baseline.notes) { $null } else { [string]$baseline.notes }
    status = [string]$baseline.status
    position_accuracy = if ($null -eq $baseline.position_accuracy) { $null } else { [double]$baseline.position_accuracy }
    satellite_count = if ($null -eq $baseline.satellite_count) { $null } else { [int]$baseline.satellite_count }
    data_points_used = if ($null -eq $baseline.data_points_used) { $null } else { [int]$baseline.data_points_used }
  }
}

function ConvertTo-StringArray($value) {
  if ($null -eq $value) { return @() }
  return @($value) | Where-Object { $_ -ne $null } | ForEach-Object { [string]$_ }
}

function Test-StringArrayEqual($left, $right) {
  $leftJson = (ConvertTo-StringArray $left | Sort-Object) | ConvertTo-Json -Compress
  $rightJson = (ConvertTo-StringArray $right | Sort-Object) | ConvertTo-Json -Compress
  return $leftJson -eq $rightJson
}

$headers = @{ Authorization = "Bearer dev" }

$summary = Invoke-RestMethod -Uri "$BaseUrl/api/dashboard/summary" -Headers $headers -TimeoutSec 10
Assert-HasKeys $summary @("stationCount", "deviceOnlineCount", "alertCountToday", "systemHealthPercent") "dashboard.summary"

$trend = Invoke-RestMethod -Uri "$BaseUrl/api/dashboard/weekly-trend" -Headers $headers -TimeoutSec 10
Assert-HasKeys $trend @("labels", "rainfallMm", "alertCount", "source", "note") "dashboard.weeklyTrend"

$stations = Invoke-RestMethod -Uri "$BaseUrl/api/monitoring-stations" -Headers $headers -TimeoutSec 10
if (-not $stations.success) { throw "monitoring-stations returned success=false" }
$stationList = @($stations.data)
if ($stationList.Count -lt 1) { throw "monitoring-stations returned empty list" }
Assert-HasKeys $stationList[0] @("device_id", "station_name", "location_name", "latitude", "longitude") "monitoring-stations[0]"

$devices = Invoke-RestMethod -Uri "$BaseUrl/api/devices" -Headers $headers -TimeoutSec 10
$deviceList = @($devices)
if ($deviceList.Count -lt 1) { throw "devices returned empty list" }
Assert-HasKeys $deviceList[0] @("id", "name", "stationId", "stationName", "type", "status", "lastSeenAt") "devices[0]"
Assert-HasKeys $deviceList[0] @("legacyDeviceId", "sensorTypes") "devices[0]"

$stationId = [string]$deviceList[0].stationId
$filtered = Invoke-RestMethod -Uri "$BaseUrl/api/devices?station_id=$stationId" -Headers $headers -TimeoutSec 10
if (@($filtered).Count -lt 1) { throw "devices filtered by station_id returned empty list" }

$deviceByLegacyId = @{}
$deviceByActualId = @{}
foreach ($device in $deviceList) {
  $deviceByLegacyId[[string]$device.legacyDeviceId] = $device
  $deviceByActualId[[string]$device.id] = $device
}

foreach ($station in $stationList) {
  $legacyKey = [string]$station.device_id
  $actualKey = [string]$station.actual_device_id
  if (-not $deviceByLegacyId.Contains($legacyKey)) {
    throw "monitoring-stations device_id missing in devices: $legacyKey"
  }
  if (-not $deviceByActualId.Contains($actualKey)) {
    throw "monitoring-stations actual_device_id missing in devices: $actualKey"
  }

  $device = $deviceByLegacyId[$legacyKey]
  if ([string]$device.id -ne $actualKey) {
    throw "device uuid mismatch for legacy id: $legacyKey"
  }
  if ([string]$device.stationName -ne [string]$station.station_name) {
    throw "station name mismatch for legacy id: $legacyKey"
  }
  if (-not (Test-StringArrayEqual $device.sensorTypes $station.sensor_types)) {
    throw "sensor types mismatch for legacy id: $legacyKey"
  }
}

$baselines = Invoke-RestMethod -Uri "$BaseUrl/api/baselines" -Headers $headers -TimeoutSec 10
if (-not $baselines.success) { throw "baselines returned success=false" }
$baselineList = @($baselines.data)
if ($baselineList.Count -lt 1) { throw "baselines returned empty list" }
Assert-HasKeys $baselineList[0] @("device_id", "baseline_latitude", "baseline_longitude", "status") "baselines[0]"

$legacyDeviceKey = [string]$baselineList[0].device_id
$baselineBackedDevice =
  @($deviceList | Where-Object {
    ([string]$_.legacyDeviceId -eq $legacyDeviceKey) -or ([string]$_.id -eq $legacyDeviceKey)
  } | Select-Object -First 1)[0]
if ($null -eq $baselineBackedDevice) {
  throw "gps proof baseline-backed device missing"
}
$deviceId = [string]$baselineBackedDevice.id
$gps = Invoke-RestMethod -Uri "$BaseUrl/api/gps-deformation/${deviceId}?days=7" -Headers $headers -TimeoutSec 10
if (-not $gps.success) { throw "gps-deformation returned success=false" }
Assert-HasKeys $gps.data @("hasBaseline", "realTimeDisplacement", "dataQuality", "results", "points") "gps-deformation.data"

$baselineDetail = Invoke-RestMethod -Uri "$BaseUrl/api/baselines/$legacyDeviceKey" -Headers $headers -TimeoutSec 10
if (-not $baselineDetail.success) { throw "baseline detail returned success=false" }
Assert-HasKeys $baselineDetail.data @("device_id", "baseline_latitude", "baseline_longitude", "status") "baselines.detail"

$baselineAlt = 12.3
if ($null -ne $baselineDetail.data.baseline_altitude) {
  $parsedAlt = 0.0
  if ([double]::TryParse([string]$baselineDetail.data.baseline_altitude, [ref]$parsedAlt)) {
    $baselineAlt = $parsedAlt
  }
}

$upsertBody = @{
  latitude = [math]::Round([double]$baselineDetail.data.baseline_latitude + 0.00001, 6)
  longitude = [math]::Round([double]$baselineDetail.data.baseline_longitude + 0.00001, 6)
  altitude = [math]::Round([double]$baselineAlt, 2)
  establishedBy = "desk-http-proof"
  notes = "desk-http-proof"
  persist = $false
} | ConvertTo-Json -Compress
$baselineUpsert = Invoke-RestMethod -Uri "$BaseUrl/api/baselines/$legacyDeviceKey" -Method Put -Headers $headers -ContentType "application/json" -Body $upsertBody -TimeoutSec 10
if (-not $baselineUpsert.success) { throw "baseline upsert returned success=false" }

$baselineAutoBody = @{ persist = $false } | ConvertTo-Json -Compress
$baselineAuto = Invoke-RestMethod -Uri "$BaseUrl/api/baselines/$legacyDeviceKey/auto-establish" -Method Post -Headers $headers -ContentType "application/json" -Body $baselineAutoBody -TimeoutSec 10
if (-not $baselineAuto.success) { throw "baseline auto-establish returned success=false" }

$baselineQuality = Invoke-RestMethod -Uri "$BaseUrl/api/baselines/$legacyDeviceKey/quality-check" -Headers @{ Authorization = "Bearer dev" } -TimeoutSec 10
if (-not $baselineQuality.success) { throw "baseline quality-check returned success=false" }
Assert-HasKeys $baselineQuality.data @("deviceId", "driftMeters", "recommendation") "baselines.quality"

$baselineDetailAfter = Invoke-RestMethod -Uri "$BaseUrl/api/baselines/$legacyDeviceKey" -Headers $headers -TimeoutSec 10
if (-not $baselineDetailAfter.success) { throw "baseline detail after mutations returned success=false" }

if ($baselineUpsert.persisted -ne $false) { throw "baseline upsert should be non-persistent in proof mode" }
if ($baselineAuto.data.persisted -ne $false) { throw "baseline auto-establish should be non-persistent in proof mode" }

$baselineBeforeSnapshot = Get-BaselineSnapshot $baselineDetail.data
$baselineAfterSnapshot = Get-BaselineSnapshot $baselineDetailAfter.data
$beforeJson = $baselineBeforeSnapshot | ConvertTo-Json -Compress
$afterJson = $baselineAfterSnapshot | ConvertTo-Json -Compress
if ($beforeJson -ne $afterJson) {
  throw "baseline proof mutated persisted baseline state"
}

$system = Invoke-RestMethod -Uri "$BaseUrl/api/system/status" -Headers $headers -TimeoutSec 10
Assert-HasKeys $system @("uptimeS", "postgres", "clickhouse", "kafka", "source", "note", "items") "system.status"

$report = [ordered]@{
  baseUrl = $BaseUrl
  summary = $summary
  weeklyTrend = @{
    labels = @($trend.labels).Count
    rainfallSum = (@($trend.rainfallMm) | Measure-Object -Sum).Sum
    alertSum = (@($trend.alertCount) | Measure-Object -Sum).Sum
    source = $trend.source
  }
  stations = @{
    count = $stationList.Count
    first = $stationList[0]
  }
  devices = @{
    count = $deviceList.Count
    filteredCount = @($filtered).Count
    first = $deviceList[0]
    firstSensorTypes = @($deviceList[0].sensorTypes)
    stationConsistency = $true
  }
  baselines = @{
    count = $baselineList.Count
    first = $baselineList[0]
    detail = $baselineDetail.data
    detailAfter = $baselineDetailAfter.data
    upsertMessage = $baselineUpsert.message
    upsertPersisted = $baselineUpsert.persisted
    autoPointsUsed = $baselineAuto.data.pointsUsed
    autoPersisted = $baselineAuto.data.persisted
    qualityLevel = $baselineQuality.data.recommendation.level
    proofStable = $true
  }
  gps = @{
    deviceId = $deviceId
    hasLatestData = $gps.data.realTimeDisplacement.hasLatestData
    totalPoints = $gps.data.dataQuality.totalPoints
    validPoints = $gps.data.dataQuality.validPoints
    latestTime = $gps.data.realTimeDisplacement.latestTime
  }
  system = @{
    source = $system.source
    items = @($system.items).Count
  }
}

$report | ConvertTo-Json -Depth 8
