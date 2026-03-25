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

function Get-V1DeviceDerivedStatus($device) {
  $rawStatus = [string]$device.status
  if ($rawStatus -eq "revoked") { return "offline" }
  $lastSeenAt = [string]$device.lastSeenAt
  if ($lastSeenAt) {
    $ts = [DateTime]::Parse($lastSeenAt)
    if ($ts.ToUniversalTime() -ge ([DateTime]::UtcNow.AddHours(-24))) {
      return "online"
    }
  }
  if ($rawStatus -eq "active") { return "warning" }
  return "offline"
}

function Get-RiskRank([string]$risk) {
  switch ($risk) {
    "high" { return 3 }
    "mid" { return 2 }
    "medium" { return 2 }
    default { return 1 }
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

$summary = Invoke-RestMethod -Uri "$BaseUrl/api/dashboard/summary" -Headers $headers -TimeoutSec 10
Assert-HasKeys $summary @("stationCount", "deviceOnlineCount", "alertCountToday", "systemHealthPercent") "legacy.dashboard.summary"

$v1DashboardEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/dashboard" -Headers $headers -TimeoutSec 10
Assert-HasKeys $v1DashboardEnvelope @("success", "data") "v1.dashboard.envelope"
$v1Dashboard = $v1DashboardEnvelope.data
Assert-HasKeys $v1Dashboard @("stations", "onlineDevices", "todayAlerts") "v1.dashboard"
Assert-True ([int]$summary.stationCount -eq [int]$v1Dashboard.stations) "legacy/v1 dashboard station count mismatch"
Assert-True ([int]$summary.deviceOnlineCount -eq [int]$v1Dashboard.onlineDevices) "legacy/v1 dashboard online device count mismatch"
Assert-True ([int]$summary.alertCountToday -eq [int]$v1Dashboard.todayAlerts) "legacy/v1 dashboard today alerts mismatch"

$legacyTrend = Invoke-RestMethod -Uri "$BaseUrl/api/dashboard/weekly-trend" -Headers $headers -TimeoutSec 10
Assert-HasKeys $legacyTrend @("labels", "rainfallMm", "alertCount", "source", "note") "legacy.dashboard.weeklyTrend"

$v1TrendEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/dashboard/weekly-trend" -Headers $headers -TimeoutSec 10
Assert-HasKeys $v1TrendEnvelope @("success", "data") "v1.dashboard.weeklyTrend.envelope"
$v1Trend = $v1TrendEnvelope.data
Assert-HasKeys $v1Trend @("labels", "rainfallMm", "alertCount", "source", "note") "v1.dashboard.weeklyTrend"

$stations = Invoke-RestMethod -Uri "$BaseUrl/api/monitoring-stations" -Headers $headers -TimeoutSec 10
if (-not $stations.success) { throw "monitoring-stations returned success=false" }
$stationList = @($stations.data)
Assert-True ($stationList.Count -gt 0) "monitoring-stations returned empty list"
Assert-HasKeys $stationList[0] @("device_id", "actual_device_id", "station_name", "sensor_types", "online_status") "monitoring-stations[0]"

$v1StationsEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/stations?page=1&pageSize=200" -Headers $headers -TimeoutSec 10
Assert-HasKeys $v1StationsEnvelope @("success", "data") "v1.stations.envelope"
$v1Stations = @($v1StationsEnvelope.data.list)
Assert-True ($v1Stations.Count -gt 0) "v1 stations returned empty list"
Assert-HasKeys $v1Stations[0] @("stationId", "stationName", "status", "metadata") "v1.stations[0]"

$devices = Invoke-RestMethod -Uri "$BaseUrl/api/devices" -Headers $headers -TimeoutSec 10
$deviceList = @($devices)
Assert-True ($deviceList.Count -gt 0) "devices returned empty list"
Assert-HasKeys $deviceList[0] @("id", "name", "legacyDeviceId", "stationId", "stationName", "type", "sensorTypes", "status", "lastSeenAt") "devices[0]"

$v1DevicesEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/devices?page=1&pageSize=200" -Headers $headers -TimeoutSec 10
Assert-HasKeys $v1DevicesEnvelope @("success", "data") "v1.devices.envelope"
$v1Devices = @($v1DevicesEnvelope.data.list)
Assert-True ($v1Devices.Count -gt 0) "v1 devices returned empty list"
Assert-HasKeys $v1Devices[0] @("deviceId", "deviceName", "deviceType", "status", "stationId", "lastSeenAt") "v1.devices[0]"

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

$deviceById = @{}
$deviceByLegacyId = @{}
foreach ($device in $deviceList) {
  $deviceById[[string]$device.id] = $device
  $deviceByLegacyId[[string]$device.legacyDeviceId] = $device
}

foreach ($station in $stationList) {
  $legacyId = [string]$station.device_id
  $actualId = [string]$station.actual_device_id
  Assert-True ($deviceByLegacyId.Contains($legacyId)) "station legacy device missing in /api/devices: $legacyId"
  Assert-True ($deviceById.Contains($actualId)) "station actual device missing in /api/devices: $actualId"

  $device = $deviceById[$actualId]
  Assert-True ([string]$device.legacyDeviceId -eq $legacyId) "legacyDeviceId mismatch for $actualId"
  Assert-True ([string]$device.stationName -eq [string]$station.station_name) "stationName mismatch for $actualId"

  $deviceSensorTypes = (@($device.sensorTypes) | ForEach-Object { [string]$_ } | Sort-Object) | ConvertTo-Json -Compress
  $stationSensorTypes = (@($station.sensor_types) | ForEach-Object { [string]$_ } | Sort-Object) | ConvertTo-Json -Compress
  Assert-True ($deviceSensorTypes -eq $stationSensorTypes) "sensorTypes mismatch for $actualId"
}

$v1StationById = @{}
foreach ($station in $v1Stations) {
  $v1StationById[[string]$station.stationId] = $station
}

$v1DeviceById = @{}
foreach ($device in $v1Devices) {
  $v1DeviceById[[string]$device.deviceId] = $device
}

Assert-True ($v1Stations.Count -ge 2) "expected at least two v1 stations in demo seed"
Assert-True ($v1Devices.Count -eq $deviceList.Count) "legacy/v1 device count mismatch"

foreach ($device in $deviceList) {
  $deviceId = [string]$device.id
  Assert-True ($v1DeviceById.Contains($deviceId)) "v1 devices missing device: $deviceId"
  $v1Device = $v1DeviceById[$deviceId]
  Assert-True ([string]$v1Device.deviceName -eq [string]$device.name) "legacy/v1 device name mismatch for $deviceId"
  Assert-True ([string]$v1Device.stationId -eq [string]$device.stationId) "legacy/v1 device stationId mismatch for $deviceId"
}

foreach ($station in $v1Stations) {
  $stationId = [string]$station.stationId
  $matchingDevices = @($v1Devices | Where-Object { [string]$_.stationId -eq $stationId })
  Assert-True ($matchingDevices.Count -gt 0) "v1 station has no devices: $stationId"
}

$legacyStationGroups = @{}
foreach ($item in $stationList) {
  $key = "{0}|{1}|{2}|{3}" -f [string]$item.station_name, [string]$item.location_name, [string]$item.latitude, [string]$item.longitude
  if (-not $legacyStationGroups.Contains($key)) {
    $legacyStationGroups[$key] = [ordered]@{
      stationName = [string]$item.station_name
      area = [string]$item.location_name
      lat = [double]$item.latitude
      lng = [double]$item.longitude
      risk = [string]$item.risk_level
      status = if ([string]$item.online_status -eq "online") { "online" } else { "offline" }
      deviceCount = 1
    }
  } else {
    $group = $legacyStationGroups[$key]
    $group.deviceCount += 1
    if ((Get-RiskRank ([string]$item.risk_level)) -gt (Get-RiskRank ([string]$group.risk))) {
      $group.risk = [string]$item.risk_level
    }
    if ([string]$item.online_status -eq "online") {
      $group.status = "online"
    }
  }
}

Assert-True ($legacyStationGroups.Count -eq $v1Stations.Count) "legacy/v1 grouped station count mismatch"

foreach ($station in $v1Stations) {
  $metadata = $station.metadata
  $locationName = if ($metadata.locationName) { [string]$metadata.locationName } elseif ($metadata.location_name) { [string]$metadata.location_name } else { [string]$station.stationName }
  $key = "{0}|{1}|{2}|{3}" -f [string]$station.stationName, $locationName, [string]$station.latitude, [string]$station.longitude
  Assert-True ($legacyStationGroups.Contains($key)) "v1 station missing in grouped legacy stations: $key"
  $legacyGroup = $legacyStationGroups[$key]
  $matchingDevices = @($v1Devices | Where-Object { [string]$_.stationId -eq [string]$station.stationId })
  $derivedStatus = "offline"
  $stationRisk = if ($metadata.riskLevel) { [string]$metadata.riskLevel } elseif ($metadata.risk_level) { [string]$metadata.risk_level } else { "" }
  foreach ($device in $matchingDevices) {
    $nextStatus = Get-V1DeviceDerivedStatus $device
    if ($nextStatus -eq "online") {
      $derivedStatus = "online"
      break
    }
    if ($derivedStatus -ne "warning" -and $nextStatus -eq "warning") {
      $derivedStatus = "warning"
    }
  }
  Assert-True ([string]$legacyGroup.stationName -eq [string]$station.stationName) "legacy/v1 stationName mismatch: $key"
  Assert-True ([string]$legacyGroup.area -eq $locationName) "legacy/v1 station area mismatch: $key"
  Assert-True ([int]$legacyGroup.deviceCount -eq $matchingDevices.Count) "legacy/v1 station deviceCount mismatch: $key"
  Assert-True ([string]$legacyGroup.risk -eq $stationRisk) "legacy/v1 station risk mismatch: $key"
  if ([string]$legacyGroup.status -eq "online") {
    Assert-True ($derivedStatus -eq "online") "legacy/v1 station status mismatch: $key"
  }
}

$legacyBaselinesEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/baselines" -Headers $headers -TimeoutSec 10
Assert-HasKeys $legacyBaselinesEnvelope @("success", "data") "legacy.baselines.envelope"
$legacyBaselines = @($legacyBaselinesEnvelope.data)
Assert-True ($legacyBaselines.Count -gt 0) "legacy baselines returned empty list"
$legacyBaselineByLegacyId = @{}
foreach ($baseline in $legacyBaselines) {
  $legacyBaselineByLegacyId[[string]$baseline.device_id] = $baseline
}

$baselineEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/gps/baselines?page=1&pageSize=200" -Headers $headers -TimeoutSec 10
Assert-HasKeys $baselineEnvelope @("success", "data") "v1.gps.baselines.envelope"
$baselineData = $baselineEnvelope.data
Assert-HasKeys $baselineData @("list", "pagination") "v1.gps.baselines.data"
$baselineList = @($baselineData.list)
Assert-True ($baselineList.Count -gt 0) "v1 gps baselines returned empty list"
Assert-HasKeys $baselineList[0] @("deviceId", "deviceName", "stationId", "baseline", "computedAt") "v1.gps.baselines[0]"

$baselineByDeviceId = @{}
foreach ($baseline in $baselineList) {
  $baselineByDeviceId[[string]$baseline.deviceId] = $baseline
  Assert-True ($deviceById.Contains([string]$baseline.deviceId)) "baseline device missing in /api/devices: $($baseline.deviceId)"

  $device = $deviceById[[string]$baseline.deviceId]
  $legacyDeviceId = [string]$device.legacyDeviceId
  Assert-True ($legacyBaselineByLegacyId.Contains($legacyDeviceId)) "v1 baseline missing in legacy baselines: $legacyDeviceId"
  $legacyBaseline = $legacyBaselineByLegacyId[$legacyDeviceId]
  Assert-True ([double]$legacyBaseline.baseline_latitude -eq [double]$baseline.baseline.latitude) "legacy/v1 baseline latitude mismatch for $legacyDeviceId"
  Assert-True ([double]$legacyBaseline.baseline_longitude -eq [double]$baseline.baseline.longitude) "legacy/v1 baseline longitude mismatch for $legacyDeviceId"
  Assert-True ([double]$legacyBaseline.baseline_altitude -eq [double]$baseline.baseline.altitude) "legacy/v1 baseline altitude mismatch for $legacyDeviceId"
  Assert-True ([string]$legacyBaseline.established_by -eq [string]$baseline.baseline.establishedBy) "legacy/v1 baseline establishedBy mismatch for $legacyDeviceId"
  Assert-True ([int]$legacyBaseline.data_points_used -eq [int]$baseline.pointsCount) "legacy/v1 baseline pointsCount mismatch for $legacyDeviceId"
}

$missingBaselineDevices = @($deviceList | Where-Object { -not $baselineByDeviceId.Contains([string]$_.id) })
Assert-True ($missingBaselineDevices.Count -ge 1) "expected at least one device without baseline in mixed proof"

$targetDevice = $deviceList | Where-Object { $baselineByDeviceId.Contains([string]$_.id) } | Select-Object -First 1
Assert-True ($null -ne $targetDevice) "no baseline-backed device available for mixed proof"
$baselineBefore = $baselineByDeviceId[[string]$targetDevice.id]
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
$baselineBeforeJson = $baselineBeforeSnapshot | ConvertTo-Json -Compress
$baselineAfterJson = $baselineAfterSnapshot | ConvertTo-Json -Compress
Assert-True ($baselineBeforeJson -eq $baselineAfterJson) "v1 baseline proof mutated persisted baseline state"

$query = New-QueryString([ordered]@{
  startTime = "2026-03-10T00:00:00Z"
  endTime = "2026-03-18T00:00:00Z"
  interval = "1h"
})
$gpsSeriesEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/gps/deformations/$([string]$targetDevice.id)/series?$query" -Headers $headers -TimeoutSec 10
Assert-HasKeys $gpsSeriesEnvelope @("success", "data") "v1.gps.deformations.envelope"
$gpsSeries = $gpsSeriesEnvelope.data
Assert-HasKeys $gpsSeries @("deviceId", "baseline", "points") "v1.gps.deformations.data"
Assert-True ([string]$gpsSeries.deviceId -eq [string]$targetDevice.id) "gps series deviceId mismatch"
Assert-True (@($gpsSeries.points).Count -gt 0) "gps series returned empty points"
Assert-True ($baselineByDeviceId.Contains([string]$gpsSeries.deviceId)) "gps series device missing in baseline list"

$seriesBaseline = $gpsSeries.baseline
$listBaseline = $baselineBefore.baseline
Assert-True ([double]$seriesBaseline.latitude -eq [double]$listBaseline.latitude) "gps series baseline latitude mismatch"
Assert-True ([double]$seriesBaseline.longitude -eq [double]$listBaseline.longitude) "gps series baseline longitude mismatch"

$legacySystem = Invoke-RestMethod -Uri "$BaseUrl/api/system/status" -Headers $headers -TimeoutSec 10
Assert-HasKeys $legacySystem @("source", "note", "items") "legacy.system.status"

$v1SystemEnvelope = Invoke-RestMethod -Uri "$BaseUrl/api/v1/system/status" -Headers $headers -TimeoutSec 10
Assert-HasKeys $v1SystemEnvelope @("success", "data") "v1.system.status.envelope"
$v1System = $v1SystemEnvelope.data
Assert-HasKeys $v1System @("source", "note", "items") "v1.system.status"
Assert-True ([string]$legacySystem.source -eq [string]$v1System.source) "legacy/v1 system source mismatch"
Assert-True (@($legacySystem.items).Count -eq @($v1System.items).Count) "legacy/v1 system items mismatch"

$report = [ordered]@{
  baseUrl = $BaseUrl
  summary = [ordered]@{
    stationCount = $summary.stationCount
    deviceOnlineCount = $summary.deviceOnlineCount
    alertCountToday = $summary.alertCountToday
    systemHealthPercent = $summary.systemHealthPercent
    legacyEqualsV1Core = $true
  }
  weeklyTrend = [ordered]@{
    legacyEqualsV1 = $true
    labels = @($legacyTrend.labels).Count
    rainfallSum = (@($legacyTrend.rainfallMm) | Measure-Object -Sum).Sum
    alertSum = (@($legacyTrend.alertCount) | Measure-Object -Sum).Sum
  }
  devices = [ordered]@{
    count = $deviceList.Count
    first = $deviceList[0]
    legacyEqualsV1 = $true
    stationConsistency = $true
    missingBaselineCount = $missingBaselineDevices.Count
  }
  stations = [ordered]@{
    legacyCount = $stationList.Count
    v1Count = $v1Stations.Count
    legacyEqualsV1 = $true
  }
  baselines = [ordered]@{
    count = $baselineList.Count
    first = $baselineList[0]
    legacyCount = $legacyBaselines.Count
    legacyEqualsV1 = $true
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
