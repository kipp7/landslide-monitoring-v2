[CmdletBinding()]
param(
  [string]$CommissioningReport = "docs/unified/reports/field-formal-device-commissioning-latest.json",
  [string]$ComposeEnvFile = "infra/compose/.env",
  [string]$ClickHouseContainer = "lsmv2_clickhouse",
  [int]$SampleLimit = 50,
  [int]$RequiredPoints = 20,
  [int]$SessionGapSeconds = 600,
  [double]$GoodP95Meters = 2,
  [double]$WarnP95Meters = 5,
  [string]$OutFile = "docs/unified/reports/field-gps-baseline-readiness-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Parse-EnvFile {
  param([string]$Path)

  $map = @{}
  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }
    $idx = $trimmed.IndexOf("=")
    if ($idx -lt 1) {
      continue
    }
    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()
    $map[$key] = $value
  }
  return $map
}

function Haversine-Meters {
  param(
    [double]$Lat1,
    [double]$Lon1,
    [double]$Lat2,
    [double]$Lon2
  )

  $toRad = [Math]::PI / 180.0
  $r = 6371000.0
  $dLat = ($Lat2 - $Lat1) * $toRad
  $dLon = ($Lon2 - $Lon1) * $toRad
  $aLat = $Lat1 * $toRad
  $bLat = $Lat2 * $toRad
  $sinDLat = [Math]::Sin($dLat / 2.0)
  $sinDLon = [Math]::Sin($dLon / 2.0)
  $h = $sinDLat * $sinDLat + [Math]::Cos($aLat) * [Math]::Cos($bLat) * $sinDLon * $sinDLon
  return 2.0 * $r * [Math]::Atan2([Math]::Sqrt($h), [Math]::Sqrt(1.0 - $h))
}

function Get-Percentile {
  param(
    [double[]]$Values,
    [double]$P
  )

  if (-not $Values -or $Values.Count -eq 0) {
    return 0.0
  }

  $sorted = @($Values | Sort-Object)
  $index = [Math]::Ceiling($P * $sorted.Count) - 1
  if ($index -lt 0) { $index = 0 }
  if ($index -ge $sorted.Count) { $index = $sorted.Count - 1 }
  return [double]$sorted[$index]
}

function Get-SessionStats {
  param(
    [object[]]$Points
  )

  if (-not $Points -or $Points.Count -eq 0) {
    return $null
  }

  $latMean = (($Points | Measure-Object -Property lat -Average).Average)
  $lonMean = (($Points | Measure-Object -Property lon -Average).Average)
  $distances = @()
  foreach ($point in $Points) {
    $distances += Haversine-Meters -Lat1 $latMean -Lon1 $lonMean -Lat2 ([double]$point.lat) -Lon2 ([double]$point.lon)
  }

  $first = $Points[0]
  $last = $Points[$Points.Count - 1]
  $firstToLast = Haversine-Meters -Lat1 ([double]$first.lat) -Lon1 ([double]$first.lon) -Lat2 ([double]$last.lat) -Lon2 ([double]$last.lon)
  $spanSeconds = [int][Math]::Round((([datetime]$last.ts) - ([datetime]$first.ts)).TotalSeconds)
  $p95 = Get-Percentile -Values $distances -P 0.95
  $max = if ($distances.Count -gt 0) { (($distances | Measure-Object -Maximum).Maximum) } else { 0.0 }

  return [ordered]@{
    startTs = ([datetime]$first.ts).ToString("yyyy-MM-ddTHH:mm:ssZ")
    endTs = ([datetime]$last.ts).ToString("yyyy-MM-ddTHH:mm:ssZ")
    points = [int]$Points.Count
    spanSeconds = $spanSeconds
    centroidLatitude = [double]$latMean
    centroidLongitude = [double]$lonMean
    p95Meters = [double]$p95
    maxMeters = [double]$max
    firstToLastMeters = [double]$firstToLast
  }
}

function Get-Sessions {
  param(
    [object[]]$Points,
    [int]$GapSeconds
  )

  $sessions = New-Object System.Collections.ArrayList
  if (-not $Points -or $Points.Count -eq 0) {
    return @()
  }

  $current = New-Object System.Collections.ArrayList
  [void]$current.Add($Points[0])

  for ($i = 1; $i -lt $Points.Count; $i += 1) {
    $previous = [datetime]$Points[$i - 1].ts
    $point = $Points[$i]
    $currentTs = [datetime]$point.ts
    $gap = [Math]::Round(($currentTs - $previous).TotalSeconds)
    if ($gap -gt $GapSeconds) {
      [void]$sessions.Add(@($current))
      $current = New-Object System.Collections.ArrayList
    }
    [void]$current.Add($point)
  }

  if ($current.Count -gt 0) {
    [void]$sessions.Add(@($current))
  }

  return @($sessions)
}

function Invoke-ClickHouseJsonRows {
  param(
    [string]$Sql,
    [hashtable]$EnvMap,
    [string]$ContainerName
  )

  $raw = $Sql | docker exec -i $ContainerName clickhouse-client `
    --user $EnvMap["CH_USER"] `
    --password $EnvMap["CH_PASSWORD"] `
    --database $EnvMap["CH_DATABASE"] `
    --multiquery 2>$null

  if ($LASTEXITCODE -ne 0) {
    throw "clickhouse-client failed"
  }

  $lines = @($raw | Where-Object { $_ -and $_.Trim() })
  $items = @()
  foreach ($line in $lines) {
    $items += ($line | ConvertFrom-Json)
  }
  return @($items)
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$commissioningPath = Join-Path $repoRoot $CommissioningReport
$envPath = Join-Path $repoRoot $ComposeEnvFile
$outPath = Join-Path $repoRoot $OutFile
$outDir = Split-Path -Parent $outPath
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$commissioning = Get-Content -Raw $commissioningPath | ConvertFrom-Json
$envMap = Parse-EnvFile -Path $envPath

$devices = New-Object System.Collections.ArrayList
foreach ($device in @($commissioning.devices)) {
  $sql = @"
SELECT
  toString(received_ts) AS ts,
  maxIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = 'gps_latitude') AS lat,
  maxIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = 'gps_longitude') AS lon
FROM $($envMap["CH_DATABASE"]).telemetry_raw
WHERE device_id = '$([string]$device.deviceId)'
  AND sensor_key IN ('gps_latitude', 'gps_longitude')
GROUP BY received_ts
HAVING isNotNull(lat) AND isNotNull(lon)
ORDER BY received_ts ASC
LIMIT $SampleLimit
FORMAT JSONEachRow
"@

  $rows = @(Invoke-ClickHouseJsonRows -Sql $sql -EnvMap $envMap -ContainerName $ClickHouseContainer)
  $points = @($rows | ForEach-Object {
    [pscustomobject]@{
      ts = [datetime]([string]$_.ts + "Z")
      lat = [double]$_.lat
      lon = [double]$_.lon
    }
  } | Sort-Object ts)

  $sessions = @(Get-Sessions -Points $points -GapSeconds $SessionGapSeconds)
  $sessionReports = New-Object System.Collections.ArrayList
  foreach ($session in $sessions) {
    $stats = Get-SessionStats -Points $session
    if ($null -ne $stats) {
      [void]$sessionReports.Add($stats)
    }
  }

  $currentSession = if ($sessions.Count -gt 0) { @($sessions[$sessions.Count - 1]) } else { @() }
  $currentStats = if ($currentSession.Count -gt 0) { Get-SessionStats -Points $currentSession } else { $null }
  $latestPoint = if ($points.Count -gt 0) { $points[$points.Count - 1] } else { $null }
  $previousSessionStats = if ($sessionReports.Count -ge 2) { $sessionReports[$sessionReports.Count - 2] } else { $null }
  $sessionJumpMeters = $null
  if ($null -ne $currentStats -and $null -ne $previousSessionStats) {
    $sessionJumpMeters = Haversine-Meters `
      -Lat1 ([double]$previousSessionStats.centroidLatitude) `
      -Lon1 ([double]$previousSessionStats.centroidLongitude) `
      -Lat2 ([double]$currentStats.centroidLatitude) `
      -Lon2 ([double]$currentStats.centroidLongitude)
  }

  $baseline = $device.baseline
  $verdict = ""
  $reason = ""
  $recommendation = ""

  if ($points.Count -eq 0) {
    $verdict = "no_gps_points"
    $reason = "No valid gps_latitude/gps_longitude points were found in ClickHouse for this device."
    $recommendation = "Restore GPS uplink for this node first, then rerun commissioning baseline."
  } elseif ($currentSession.Count -lt 10) {
    $verdict = "insufficient_current_session_points"
    $reason = "The current continuous session has fewer than 10 valid points, so auto baseline cannot be established yet."
    $recommendation = "Keep the node online until the current session accumulates at least 10-20 valid GPS points, then rerun."
  } elseif ($currentSession.Count -lt $RequiredPoints -and $sessions.Count -gt 1) {
    $verdict = "session_mixing_risk"
    $reason = "The current continuous session does not yet have enough points, and older sessions exist, so taking the latest $RequiredPoints points would mix sessions."
    $recommendation = "Do not rebuild the baseline yet. Wait for the current session to accumulate enough points, then rerun this node alone."
  } elseif ($null -ne $currentStats -and $currentStats.p95Meters -le $GoodP95Meters) {
    $verdict = "ready"
    $reason = "The spatial dispersion of the current continuous session is already within the good threshold."
    $recommendation = "This node is ready for a standalone commissioning baseline rerun."
  } elseif ($null -ne $currentStats -and $currentStats.p95Meters -le $WarnP95Meters) {
    $verdict = "warn"
    $reason = "The current session dispersion is still larger than ideal, but it is close to usable."
    $recommendation = "Collect a longer stationary window first and confirm it can move into the good range."
  } else {
    $verdict = "current_session_drift_bad"
    $reason = "The current continuous session itself is drifting, so the poor quality is not caused by old-session mixing."
    $recommendation = "Keep the device stationary, ensure stable sky view, let GPS warm up fully, and inspect hardware or antenna if needed."
  }

  [void]$devices.Add([ordered]@{
    fieldNodeId = [string]$device.fieldNodeId
    deviceId = [string]$device.deviceId
    baselineAcceptance = [ordered]@{
      commissioningPassed = [bool]$baseline.passed
      autoEstablishStatusCode = if ($null -ne $baseline.autoEstablish) { [int]$baseline.autoEstablish.statusCode } else { $null }
      qualityLevel = if ($null -ne $baseline.qualityCheck) { [string]$baseline.qualityCheck.level } else { "" }
      qualityP95Meters = if ($null -ne $baseline.qualityCheck) { [double]$baseline.qualityCheck.p95Meters } else { $null }
      qualityMaxMeters = if ($null -ne $baseline.qualityCheck) { [double]$baseline.qualityCheck.maxMeters } else { $null }
    }
    rawGps = [ordered]@{
      totalPointsFetched = [int]$points.Count
      latestPointTs = if ($null -ne $latestPoint) { ([datetime]$latestPoint.ts).ToString("yyyy-MM-ddTHH:mm:ssZ") } else { "" }
      sessions = @($sessionReports)
      currentSession = $currentStats
      currentSessionPoints = [int]$currentSession.Count
      previousToCurrentSessionJumpMeters = $sessionJumpMeters
    }
    diagnosis = [ordered]@{
      verdict = $verdict
      reason = $reason
      recommendation = $recommendation
    }
  })
}

$report = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  mode = "field-gps-baseline-readiness"
  sourceCommissioningReport = $CommissioningReport
  thresholds = [ordered]@{
    sampleLimit = $SampleLimit
    requiredPoints = $RequiredPoints
    sessionGapSeconds = $SessionGapSeconds
    goodP95Meters = $GoodP95Meters
    warnP95Meters = $WarnP95Meters
  }
  devices = @($devices)
}

$json = $report | ConvertTo-Json -Depth 12
Set-Content -Path $outPath -Value $json -Encoding UTF8
$json
