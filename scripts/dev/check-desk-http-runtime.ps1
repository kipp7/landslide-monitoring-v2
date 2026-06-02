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

$headers = @{ Authorization = "Bearer dev" }

$legacySummary = Invoke-RestMethod -Uri "$BaseUrl/api/dashboard/summary" -Headers $headers -TimeoutSec 10
Assert-HasKeys $legacySummary @("stationCount", "deviceOnlineCount", "alertCountToday", "systemHealthPercent") "legacy.dashboard.summary"

$v1DashboardEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/dashboard" -Headers $headers -TimeoutSec 10
Assert-HasKeys $v1DashboardEnvelope @("success", "data") "v1.dashboard.envelope"
$v1Dashboard = $v1DashboardEnvelope.data
Assert-HasKeys $v1Dashboard @("stations", "onlineDevices", "todayAlerts", "totalDevices") "v1.dashboard.data"
Assert-True ([int]$legacySummary.stationCount -eq [int]$v1Dashboard.stations) "legacy/v1 dashboard station count mismatch"
Assert-True ([int]$legacySummary.deviceOnlineCount -eq [int]$v1Dashboard.onlineDevices) "legacy/v1 dashboard online device count mismatch"
Assert-True ([int]$legacySummary.alertCountToday -eq [int]$v1Dashboard.todayAlerts) "legacy/v1 dashboard alert count mismatch"

$legacyTrend = Invoke-RestMethod -Uri "$BaseUrl/api/dashboard/weekly-trend" -Headers $headers -TimeoutSec 10
Assert-HasKeys $legacyTrend @("labels", "rainfallMm", "alertCount", "source", "note") "legacy.dashboard.weeklyTrend"

$v1TrendEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/dashboard/weekly-trend" -Headers $headers -TimeoutSec 10
Assert-HasKeys $v1TrendEnvelope @("success", "data") "v1.dashboard.weeklyTrend.envelope"
$v1Trend = $v1TrendEnvelope.data
Assert-HasKeys $v1Trend @("labels", "rainfallMm", "alertCount", "source", "note") "v1.dashboard.weeklyTrend.data"

$legacyTrendJson = [ordered]@{
  labels = @($legacyTrend.labels)
  rainfallMm = @($legacyTrend.rainfallMm)
  alertCount = @($legacyTrend.alertCount)
  source = [string]$legacyTrend.source
  note = [string]$legacyTrend.note
} | ConvertTo-Json -Compress -Depth 6
$v1TrendJson = [ordered]@{
  labels = @($v1Trend.labels)
  rainfallMm = @($v1Trend.rainfallMm)
  alertCount = @($v1Trend.alertCount)
  source = [string]$v1Trend.source
  note = [string]$v1Trend.note
} | ConvertTo-Json -Compress -Depth 6
Assert-True ($legacyTrendJson -eq $v1TrendJson) "legacy/v1 weekly trend mismatch"

$legacyStationsEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/monitoring-stations" -Headers $headers -TimeoutSec 10
Assert-HasKeys $legacyStationsEnvelope @("success", "data") "legacy.monitoring-stations.envelope"
Assert-True ([bool]$legacyStationsEnvelope.success) "legacy monitoring-stations returned success=false"
$legacyStations = New-Object System.Collections.ArrayList
foreach ($item in $legacyStationsEnvelope.data) { $legacyStations.Add($item) | Out-Null }
Assert-True ($legacyStations.Count -gt 0) "legacy monitoring-stations returned empty list"
Assert-HasKeys $legacyStations[0] @("device_id", "actual_device_id", "station_name", "location_name", "sensor_types", "online_status") "legacy.monitoring-stations[0]"

$v1StationsEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/stations?page=1&pageSize=200" -Headers $headers -TimeoutSec 10
Assert-HasKeys $v1StationsEnvelope @("success", "data") "v1.stations.envelope"
$v1Stations = @($v1StationsEnvelope.data.list)
Assert-True ($v1Stations.Count -gt 0) "v1 stations returned empty list"
Assert-HasKeys $v1Stations[0] @("stationId", "stationCode", "stationName", "status", "metadata") "v1.stations[0]"

$legacyDevices = New-Object System.Collections.ArrayList
foreach ($item in (Invoke-RestMethod -Uri "$BaseUrl/api/devices" -Headers $headers -TimeoutSec 10)) { $legacyDevices.Add($item) | Out-Null }
Assert-True ($legacyDevices.Count -gt 0) "legacy devices returned empty list"
Assert-HasKeys $legacyDevices[0] @("id", "name", "legacyDeviceId", "stationId", "stationName", "type", "sensorTypes", "status", "lastSeenAt") "legacy.devices[0]"

$v1DevicesEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/devices?page=1&pageSize=200" -Headers $headers -TimeoutSec 10
Assert-HasKeys $v1DevicesEnvelope @("success", "data") "v1.devices.envelope"
$v1Devices = @($v1DevicesEnvelope.data.list)
Assert-True ($v1Devices.Count -gt 0) "v1 devices returned empty list"
Assert-HasKeys $v1Devices[0] @("deviceId", "deviceName", "legacyDeviceId", "stationId", "stationCode", "stationName", "status", "lastSeenAt") "v1.devices[0]"
Assert-True ($legacyDevices.Count -eq $v1Devices.Count) "legacy/v1 device count mismatch"

$legacyDeviceById = @{}
$legacyDeviceByLegacyId = @{}
foreach ($device in $legacyDevices) {
  $legacyDeviceById[[string]$device.id] = $device
  $legacyDeviceByLegacyId[[string]$device.legacyDeviceId] = $device
}

$v1StationById = @{}
foreach ($station in $v1Stations) {
  $v1StationById[[string]$station.stationId] = $station
}

$v1DeviceById = @{}
foreach ($device in $v1Devices) {
  $v1DeviceById[[string]$device.deviceId] = $device
}

foreach ($legacyStation in $legacyStations) {
  $legacyKey = [string]$legacyStation.device_id
  $actualId = [string]$legacyStation.actual_device_id
  Assert-True ($legacyDeviceByLegacyId.Contains($legacyKey)) "legacy monitoring station missing device legacy id: $legacyKey"
  Assert-True ($legacyDeviceById.Contains($actualId)) "legacy monitoring station missing device uuid: $actualId"
}

foreach ($device in $legacyDevices) {
  $deviceId = [string]$device.id
  Assert-True ($v1DeviceById.Contains($deviceId)) "v1 devices missing device: $deviceId"
  $v1Device = $v1DeviceById[$deviceId]
  Assert-True ([string]$v1Device.deviceName -eq [string]$device.name) "legacy/v1 device name mismatch for $deviceId"
  Assert-True ([string]$v1Device.legacyDeviceId -eq [string]$device.legacyDeviceId) "legacy/v1 legacyDeviceId mismatch for $deviceId"
  Assert-True ([string]$v1Device.stationId -eq [string]$device.stationId) "legacy/v1 stationId mismatch for $deviceId"
}

foreach ($v1Device in $v1Devices) {
  $stationId = [string]$v1Device.stationId
  if ($stationId) {
    Assert-True ($v1StationById.Contains($stationId)) "v1 device station missing: $stationId"
  }
}

$legacyBaselinesEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/baselines" -Headers $headers -TimeoutSec 10
Assert-HasKeys $legacyBaselinesEnvelope @("success", "data") "legacy.baselines.envelope"
Assert-True ([bool]$legacyBaselinesEnvelope.success) "legacy baselines returned success=false"
$legacyBaselines = New-Object System.Collections.ArrayList
foreach ($item in $legacyBaselinesEnvelope.data) { $legacyBaselines.Add($item) | Out-Null }
Assert-True ($legacyBaselines.Count -gt 0) "legacy baselines returned empty list"
Assert-HasKeys $legacyBaselines[0] @("device_id", "baseline_latitude", "baseline_longitude", "status") "legacy.baselines[0]"
$legacyBaselineByLegacyId = @{}
foreach ($baseline in $legacyBaselines) {
  $legacyBaselineByLegacyId[[string]$baseline.device_id] = $baseline
}

$v1BaselinesEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/gps/baselines?page=1&pageSize=200" -Headers $headers -TimeoutSec 10
Assert-HasKeys $v1BaselinesEnvelope @("success", "data") "v1.gps.baselines.envelope"
$v1BaselineData = $v1BaselinesEnvelope.data
Assert-HasKeys $v1BaselineData @("list", "pagination") "v1.gps.baselines.data"
$v1Baselines = @($v1BaselineData.list)
Assert-True ($v1Baselines.Count -gt 0) "v1 gps baselines returned empty list"
Assert-HasKeys $v1Baselines[0] @("deviceId", "deviceName", "stationId", "baseline", "computedAt") "v1.gps.baselines[0]"

$v1BaselineByDeviceId = @{}
foreach ($baseline in $v1Baselines) {
  $v1BaselineByDeviceId[[string]$baseline.deviceId] = $baseline
  Assert-True ($legacyDeviceById.Contains([string]$baseline.deviceId)) "baseline device missing in legacy devices: $($baseline.deviceId)"

  $device = $legacyDeviceById[[string]$baseline.deviceId]
  $legacyDeviceId = [string]$device.legacyDeviceId
  Assert-True ($legacyBaselineByLegacyId.Contains($legacyDeviceId)) "legacy baseline missing for $legacyDeviceId"
  $legacyBaseline = $legacyBaselineByLegacyId[$legacyDeviceId]
  Assert-True ([double]$legacyBaseline.baseline_latitude -eq [double]$baseline.baseline.latitude) "legacy/v1 baseline latitude mismatch for $legacyDeviceId"
  Assert-True ([double]$legacyBaseline.baseline_longitude -eq [double]$baseline.baseline.longitude) "legacy/v1 baseline longitude mismatch for $legacyDeviceId"
  Assert-True ([double]$legacyBaseline.baseline_altitude -eq [double]$baseline.baseline.altitude) "legacy/v1 baseline altitude mismatch for $legacyDeviceId"
}

$missingBaselineDevices = @($legacyDevices | Where-Object { -not $v1BaselineByDeviceId.Contains([string]$_.id) })

$targetDevice = $legacyDevices | Where-Object { $v1BaselineByDeviceId.Contains([string]$_.id) } | Select-Object -First 1
Assert-True ($null -ne $targetDevice) "no baseline-backed device available for runtime proof"
$baselineBefore = $v1BaselineByDeviceId[[string]$targetDevice.id]
$baselineBeforeSnapshot = Get-V1BaselineSnapshot $baselineBefore

$v1UpsertBody = @{
  method = "manual"
  persist = $false
  baseline = @{
    latitude = [double]$baselineBefore.baseline.latitude + 0.00001
    longitude = [double]$baselineBefore.baseline.longitude + 0.00001
    altitude = [double]$baselineBefore.baseline.altitude
    notes = "runtime-proof"
    establishedBy = "runtime-proof"
    positionAccuracyMeters = if ($null -eq $baselineBefore.baseline.positionAccuracyMeters) { 1.0 } else { [double]$baselineBefore.baseline.positionAccuracyMeters }
    satelliteCount = if ($null -eq $baselineBefore.baseline.satelliteCount) { 12 } else { [int]$baselineBefore.baseline.satelliteCount }
  }
} | ConvertTo-Json -Depth 8 -Compress
$v1Upsert = Invoke-RestMethod -Uri "$BaseUrl/api/v1/gps/baselines/$([string]$targetDevice.id)" -Method Put -Headers $headers -ContentType "application/json" -Body $v1UpsertBody -TimeoutSec 10
Assert-HasKeys $v1Upsert @("success", "data") "v1.gps.baselines.upsert"
Assert-True ($v1Upsert.data.persisted -eq $false) "v1 baseline upsert should be non-persistent in proof mode"

$v1AutoBody = @{
  pointsCount = 20
  lookbackDays = 30
  latKey = "gps_latitude"
  lonKey = "gps_longitude"
  altKey = "gps_altitude"
  persist = $false
} | ConvertTo-Json -Compress
$v1Auto = Invoke-RestMethod -Uri "$BaseUrl/api/v1/gps/baselines/$([string]$targetDevice.id)/auto-establish" -Method Post -Headers $headers -ContentType "application/json" -Body $v1AutoBody -TimeoutSec 10
Assert-HasKeys $v1Auto @("success", "data") "v1.gps.baselines.auto-establish"
Assert-True ($v1Auto.data.persisted -eq $false) "v1 baseline auto-establish should be non-persistent in proof mode"

$baselineAfterEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/gps/baselines/$([string]$targetDevice.id)" -Headers $headers -TimeoutSec 10
Assert-HasKeys $baselineAfterEnvelope @("success", "data") "v1.gps.baselines.detail.after"
$baselineAfterSnapshot = Get-V1BaselineSnapshot $baselineAfterEnvelope.data
Assert-True (($baselineBeforeSnapshot | ConvertTo-Json -Compress) -eq ($baselineAfterSnapshot | ConvertTo-Json -Compress)) "v1 baseline proof mutated persisted baseline state"

$endTimeUtc = (Get-Date).ToUniversalTime()
$startTimeUtc = $endTimeUtc.AddDays(-8)
$seriesQuery = New-QueryString([ordered]@{
  startTime = $startTimeUtc.ToString("yyyy-MM-ddTHH:mm:ssZ")
  endTime = $endTimeUtc.ToString("yyyy-MM-ddTHH:mm:ssZ")
  interval = "1h"
})
$gpsSeriesEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/gps/deformations/$([string]$targetDevice.id)/series?$seriesQuery" -Headers $headers -TimeoutSec 10
Assert-HasKeys $gpsSeriesEnvelope @("success", "data") "v1.gps.deformations.series.envelope"
$gpsSeries = $gpsSeriesEnvelope.data
Assert-HasKeys $gpsSeries @("deviceId", "baseline", "points") "v1.gps.deformations.series.data"
Assert-True (@($gpsSeries.points).Count -gt 0) "v1 gps series returned empty points"
Assert-True ([string]$gpsSeries.deviceId -eq [string]$targetDevice.id) "v1 gps series deviceId mismatch"
Assert-True ([double]$gpsSeries.baseline.latitude -eq [double]$baselineBefore.baseline.latitude) "v1 gps series baseline latitude mismatch"
Assert-True ([double]$gpsSeries.baseline.longitude -eq [double]$baselineBefore.baseline.longitude) "v1 gps series baseline longitude mismatch"

$legacySystem = Invoke-RestMethod -Uri "$BaseUrl/api/system/status" -Headers $headers -TimeoutSec 10
Assert-HasKeys $legacySystem @("source", "note", "items") "legacy.system.status"

$v1SystemEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/system/status" -Headers $headers -TimeoutSec 10
Assert-HasKeys $v1SystemEnvelope @("success", "data") "v1.system.status.envelope"
$v1System = $v1SystemEnvelope.data
Assert-HasKeys $v1System @("source", "note", "items") "v1.system.status.data"
Assert-True ([string]$legacySystem.source -eq [string]$v1System.source) "legacy/v1 system source mismatch"
Assert-True (@($legacySystem.items).Count -eq @($v1System.items).Count) "legacy/v1 system items mismatch"

$report = [ordered]@{
  baseUrl = $BaseUrl
  summary = [ordered]@{
    stationCount = [int]$legacySummary.stationCount
    deviceOnlineCount = [int]$legacySummary.deviceOnlineCount
    alertCountToday = [int]$legacySummary.alertCountToday
    systemHealthPercent = [int]$legacySummary.systemHealthPercent
    legacyEqualsV1Core = $true
  }
  weeklyTrend = [ordered]@{
    legacyEqualsV1 = $true
    labels = @($legacyTrend.labels).Count
    rainfallSum = (@($legacyTrend.rainfallMm) | Measure-Object -Sum).Sum
    alertSum = (@($legacyTrend.alertCount) | Measure-Object -Sum).Sum
  }
  devices = [ordered]@{
    count = $legacyDevices.Count
    first = $legacyDevices[0]
    legacyEqualsV1 = $true
    stationCoverage = $true
    baselineBackedDeviceCount = $v1BaselineByDeviceId.Count
    missingBaselineCount = $missingBaselineDevices.Count
  }
  stations = [ordered]@{
    legacyDeviceCount = $legacyStations.Count
    v1StationCount = $v1Stations.Count
    legacyDeviceCoverage = $true
    v1StationCoverage = $true
  }
  baselines = [ordered]@{
    count = $v1Baselines.Count
    first = $v1Baselines[0]
    legacyCount = $legacyBaselines.Count
    legacyEqualsV1 = ($legacyBaselines.Count -eq $v1Baselines.Count)
    deviceCoverage = $true
    upsertPersisted = $v1Upsert.data.persisted
    autoPersisted = $v1Auto.data.persisted
    proofStable = $true
  }
  gps = [ordered]@{
    deviceId = $gpsSeries.deviceId
    points = @($gpsSeries.points).Count
    baselineConsistency = $true
  }
  system = [ordered]@{
    source = $legacySystem.source
    legacyEqualsV1 = $true
    items = @($legacySystem.items).Count
  }
}

$report | ConvertTo-Json -Depth 8
