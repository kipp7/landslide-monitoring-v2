[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

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

function Read-DotEnv([string]$Path) {
  $map = [ordered]@{}
  foreach ($line in Get-Content -Path $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $idx = $trimmed.IndexOf("=")
    if ($idx -lt 1) { continue }
    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()
    $map[$key] = $value
  }
  return $map
}

function Invoke-PostgresText(
  [string]$Sql,
  [string]$ComposePath,
  [string]$EnvPath,
  [string]$PgUser,
  [string]$PgDatabase
) {
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    Set-Content -Path $tmp -Value $Sql -Encoding UTF8
    $output = Get-Content -Path $tmp -Raw -Encoding UTF8 | docker compose -f $ComposePath --env-file $EnvPath exec -T postgres `
      psql -v ON_ERROR_STOP=1 -U $PgUser -d $PgDatabase -t -A -F "`t" -f -
    if ($LASTEXITCODE -ne 0) {
      throw "postgres command failed (exit=$LASTEXITCODE)"
    }
    return @($output | Where-Object { $_ -and $_.Trim() })
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-PostgresBatch(
  [string]$Sql,
  [string]$ComposePath,
  [string]$EnvPath,
  [string]$PgUser,
  [string]$PgDatabase
) {
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    Set-Content -Path $tmp -Value $Sql -Encoding UTF8
    Get-Content -Path $tmp -Raw -Encoding UTF8 | docker compose -f $ComposePath --env-file $EnvPath exec -T postgres `
      psql -v ON_ERROR_STOP=1 -U $PgUser -d $PgDatabase -f - | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "postgres batch failed (exit=$LASTEXITCODE)"
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-ClickHouseScalar(
  [string]$Query,
  [string]$ComposePath,
  [string]$EnvPath,
  [string]$ChUser,
  [string]$ChPassword,
  [string]$ChDatabase
) {
  $output = docker compose -f $ComposePath --env-file $EnvPath exec -T clickhouse `
    clickhouse-client `
    --user $ChUser `
    --password $ChPassword `
    --database $ChDatabase `
    --query $Query
  if ($LASTEXITCODE -ne 0) {
    throw "clickhouse command failed (exit=$LASTEXITCODE)"
  }
  return (($output | Select-Object -First 1).ToString().Trim())
}

function Invoke-ClickHouseBatch(
  [string]$Query,
  [string]$ComposePath,
  [string]$EnvPath,
  [string]$ChUser,
  [string]$ChPassword,
  [string]$ChDatabase
) {
  docker compose -f $ComposePath --env-file $EnvPath exec -T clickhouse `
    clickhouse-client `
    --user $ChUser `
    --password $ChPassword `
    --database $ChDatabase `
    --multiquery `
    --query $Query | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "clickhouse batch failed (exit=$LASTEXITCODE)"
  }
}

function Quote-SqlLiteral([string]$Value) {
  return "'" + $Value.Replace("'", "''") + "'"
}

function Get-IsolatedDevices(
  [string]$ComposePath,
  [string]$EnvPath,
  [string]$PgUser,
  [string]$PgDatabase
) {
  $sql = @"
SELECT
  device_id::text,
  device_name,
  COALESCE(station_id::text, ''),
  COALESCE(metadata->>'note', ''),
  COALESCE(metadata->>'identityClass', COALESCE(metadata->>'identity_class', ''))
FROM devices
WHERE device_name LIKE 'field-hardware-replay-%'
   OR device_name ~ '^device_[0-9]+$'
   OR COALESCE(metadata->>'note', '') IN ('field_hardware_uplink_replay', 'field_rehearsal', 'smoke_test', 'seed demo')
   OR COALESCE(metadata->>'identityClass', COALESCE(metadata->>'identity_class', '')) IN ('seed', 'replay', 'rehearsal', 'smoke_test', 'lab')
ORDER BY created_at, device_name;
"@
  $rows = Invoke-PostgresText -Sql $sql -ComposePath $ComposePath -EnvPath $EnvPath -PgUser $PgUser -PgDatabase $PgDatabase
  return @(
    foreach ($row in $rows) {
      $parts = $row -split "`t", 5
      if ($parts.Count -lt 5) { continue }
      [pscustomobject]@{
        deviceId = $parts[0].Trim()
        deviceName = $parts[1].Trim()
        stationId = $parts[2].Trim()
        note = $parts[3].Trim()
        identityClass = $parts[4].Trim()
      }
    }
  )
}

function Get-IsolatedStations(
  [string]$ComposePath,
  [string]$EnvPath,
  [string]$PgUser,
  [string]$PgDatabase
) {
  $sql = @"
SELECT
  station_id::text,
  station_code,
  station_name,
  COALESCE(metadata->>'note', ''),
  COALESCE(metadata->>'identityClass', COALESCE(metadata->>'identity_class', ''))
FROM stations
WHERE station_code IN ('DEMO001', 'DEMO002')
   OR COALESCE(metadata->>'note', '') = 'seed demo'
   OR COALESCE(metadata->>'identityClass', COALESCE(metadata->>'identity_class', '')) IN ('seed', 'replay', 'rehearsal', 'smoke_test', 'lab')
ORDER BY created_at, station_code;
"@
  $rows = Invoke-PostgresText -Sql $sql -ComposePath $ComposePath -EnvPath $EnvPath -PgUser $PgUser -PgDatabase $PgDatabase
  return @(
    foreach ($row in $rows) {
      $parts = $row -split "`t", 5
      if ($parts.Count -lt 5) { continue }
      [pscustomobject]@{
        stationId = $parts[0].Trim()
        stationCode = $parts[1].Trim()
        stationName = $parts[2].Trim()
        note = $parts[3].Trim()
        identityClass = $parts[4].Trim()
      }
    }
  )
}

function Get-IsolatedCounts(
  [string[]]$DeviceIds,
  [string[]]$StationIds,
  [string]$ComposePath,
  [string]$EnvPath,
  [string]$PgUser,
  [string]$PgDatabase,
  [string]$ChUser,
  [string]$ChPassword,
  [string]$ChDatabase
) {
  $counts = [ordered]@{
    postgres = [ordered]@{
      ai_predictions = 0
      alert_events = 0
      alert_rules = 0
      device_command_events = 0
      device_commands = 0
      device_health_expert_actions = 0
      device_health_expert_runs = 0
      device_presence = 0
      device_sensors = 0
      device_state = 0
      gps_baselines = 0
      telemetry_dlq_messages = 0
      user_alert_subscriptions = 0
      devices = 0
      stations = 0
    }
    clickhouse = [ordered]@{
      telemetry_raw = 0
    }
  }

  $quotedDeviceIds = @($DeviceIds | Where-Object { $_ } | ForEach-Object { Quote-SqlLiteral $_ })
  $quotedStationIds = @($StationIds | Where-Object { $_ } | ForEach-Object { Quote-SqlLiteral $_ })
  $deviceListSql = if ($quotedDeviceIds.Count -gt 0) { $quotedDeviceIds -join "," } else { "" }
  $stationListSql = if ($quotedStationIds.Count -gt 0) { $quotedStationIds -join "," } else { "" }

  $countQueries = @()
  $sharedPredicates = @()
  if ($deviceListSql) { $sharedPredicates += "device_id IN ($deviceListSql)" }
  if ($stationListSql) { $sharedPredicates += "station_id IN ($stationListSql)" }
  if ($sharedPredicates.Count -gt 0) {
    $sharedWhere = $sharedPredicates -join " OR "
    $countQueries += @"
SELECT 'ai_predictions', count(*)::text FROM ai_predictions WHERE $sharedWhere
UNION ALL SELECT 'alert_events', count(*)::text FROM alert_events WHERE $sharedWhere
UNION ALL SELECT 'alert_rules', count(*)::text FROM alert_rules WHERE $sharedWhere
UNION ALL SELECT 'user_alert_subscriptions', count(*)::text FROM user_alert_subscriptions WHERE $sharedWhere
"@
  }
  if ($deviceListSql) {
    $countQueries += @"
SELECT 'device_command_events', count(*)::text
FROM device_command_events
WHERE device_id IN ($deviceListSql)
   OR command_id IN (SELECT command_id FROM device_commands WHERE device_id IN ($deviceListSql))
UNION ALL SELECT 'device_commands', count(*)::text FROM device_commands WHERE device_id IN ($deviceListSql)
UNION ALL SELECT 'device_health_expert_actions', count(*)::text FROM device_health_expert_actions WHERE device_id IN ($deviceListSql)
UNION ALL SELECT 'device_health_expert_runs', count(*)::text FROM device_health_expert_runs WHERE device_id IN ($deviceListSql)
UNION ALL SELECT 'device_presence', count(*)::text FROM device_presence WHERE device_id IN ($deviceListSql)
UNION ALL SELECT 'device_sensors', count(*)::text FROM device_sensors WHERE device_id IN ($deviceListSql)
UNION ALL SELECT 'device_state', count(*)::text FROM device_state WHERE device_id IN ($deviceListSql)
UNION ALL SELECT 'gps_baselines', count(*)::text FROM gps_baselines WHERE device_id IN ($deviceListSql)
UNION ALL SELECT 'telemetry_dlq_messages', count(*)::text FROM telemetry_dlq_messages WHERE device_id IN ($deviceListSql)
UNION ALL SELECT 'devices', count(*)::text FROM devices WHERE device_id IN ($deviceListSql)
"@
  }
  if ($stationListSql) {
    $countQueries += @"
SELECT 'stations', count(*)::text FROM stations WHERE station_id IN ($stationListSql)
"@
  }

  if ($countQueries.Count -gt 0) {
    $countSql = ($countQueries -join "`nUNION ALL`n") + ";"
    $rows = Invoke-PostgresText -Sql $countSql -ComposePath $ComposePath -EnvPath $EnvPath -PgUser $PgUser -PgDatabase $PgDatabase
    foreach ($row in $rows) {
      $parts = $row -split "`t", 2
      if ($parts.Count -lt 2) { continue }
      $key = $parts[0].Trim()
      $value = [int]$parts[1].Trim()
      if ($counts.postgres.Contains($key)) {
        $counts.postgres[$key] = [int]$counts.postgres[$key] + $value
      }
    }
  }

  if ($deviceListSql) {
    $chCount = Invoke-ClickHouseScalar `
      -Query "SELECT count() FROM telemetry_raw WHERE device_id IN ($deviceListSql)" `
      -ComposePath $ComposePath `
      -EnvPath $EnvPath `
      -ChUser $ChUser `
      -ChPassword $ChPassword `
      -ChDatabase $ChDatabase
    $counts.clickhouse.telemetry_raw = [int]$chCount
  }

  return $counts
}

$repoRoot = Resolve-RepoRoot
$resolvedEnvFile = Join-Path $repoRoot $EnvFile
$resolvedComposeFile = Join-Path $repoRoot $ComposeFile

if (-not (Test-Path $resolvedEnvFile)) { throw "env file not found: $resolvedEnvFile" }
if (-not (Test-Path $resolvedComposeFile)) { throw "compose file not found: $resolvedComposeFile" }

$envMap = Read-DotEnv $resolvedEnvFile
$pgUser = [string]$envMap["PG_USER"]
$pgDatabase = [string]$envMap["PG_DATABASE"]
$chUser = [string]$envMap["CH_USER"]
$chPassword = [string]$envMap["CH_PASSWORD"]
$chDatabase = [string]$envMap["CH_DATABASE"]

$isolatedDevices = Get-IsolatedDevices -ComposePath $resolvedComposeFile -EnvPath $resolvedEnvFile -PgUser $pgUser -PgDatabase $pgDatabase
$isolatedStations = Get-IsolatedStations -ComposePath $resolvedComposeFile -EnvPath $resolvedEnvFile -PgUser $pgUser -PgDatabase $pgDatabase

$deviceIds = @($isolatedDevices | ForEach-Object { $_.deviceId } | Where-Object { $_ })
$stationIds = @($isolatedStations | ForEach-Object { $_.stationId } | Where-Object { $_ })
$countsBefore = Get-IsolatedCounts `
  -DeviceIds $deviceIds `
  -StationIds $stationIds `
  -ComposePath $resolvedComposeFile `
  -EnvPath $resolvedEnvFile `
  -PgUser $pgUser `
  -PgDatabase $pgDatabase `
  -ChUser $chUser `
  -ChPassword $chPassword `
  -ChDatabase $chDatabase

$countsAfter = $null

if ($Apply.IsPresent -and ($deviceIds.Count -gt 0 -or $stationIds.Count -gt 0)) {
  if ($PSCmdlet.ShouldProcess("isolated field data", "Purge seed/demo/replay/history data")) {
    $quotedDeviceIds = @($deviceIds | ForEach-Object { Quote-SqlLiteral $_ })
    $quotedStationIds = @($stationIds | ForEach-Object { Quote-SqlLiteral $_ })
    $devicePredicate = if ($quotedDeviceIds.Count -gt 0) { "device_id IN (" + ($quotedDeviceIds -join ",") + ")" } else { $null }
    $stationPredicate = if ($quotedStationIds.Count -gt 0) { "station_id IN (" + ($quotedStationIds -join ",") + ")" } else { $null }
    $deleteStatements = @("BEGIN;")

    if ($devicePredicate) {
      $deleteStatements += "DELETE FROM device_command_events WHERE $devicePredicate OR command_id IN (SELECT command_id FROM device_commands WHERE $devicePredicate);"
      $deleteStatements += "DELETE FROM device_commands WHERE $devicePredicate;"
      $deleteStatements += "DELETE FROM device_health_expert_actions WHERE $devicePredicate;"
      $deleteStatements += "DELETE FROM device_health_expert_runs WHERE $devicePredicate;"
      $deleteStatements += "DELETE FROM device_presence WHERE $devicePredicate;"
      $deleteStatements += "DELETE FROM device_sensors WHERE $devicePredicate;"
      $deleteStatements += "DELETE FROM device_state WHERE $devicePredicate;"
      $deleteStatements += "DELETE FROM gps_baselines WHERE $devicePredicate;"
      $deleteStatements += "DELETE FROM telemetry_dlq_messages WHERE $devicePredicate;"
    }

    $deviceOrStationPredicates = @()
    if ($devicePredicate) { $deviceOrStationPredicates += $devicePredicate }
    if ($stationPredicate) { $deviceOrStationPredicates += $stationPredicate }
    if ($deviceOrStationPredicates.Count -gt 0) {
      $joined = $deviceOrStationPredicates -join " OR "
      $deleteStatements += "DELETE FROM ai_predictions WHERE $joined;"
      $deleteStatements += "DELETE FROM alert_events WHERE $joined;"
      $deleteStatements += "DELETE FROM alert_rules WHERE $joined;"
      $deleteStatements += "DELETE FROM user_alert_subscriptions WHERE $joined;"
    }

    if ($devicePredicate) {
      $deleteStatements += "DELETE FROM devices WHERE $devicePredicate;"
    }
    if ($stationPredicate) {
      $deleteStatements += "DELETE FROM stations WHERE $stationPredicate;"
    }
    $deleteStatements += "COMMIT;"

    Invoke-PostgresBatch `
      -Sql ($deleteStatements -join "`n") `
      -ComposePath $resolvedComposeFile `
      -EnvPath $resolvedEnvFile `
      -PgUser $pgUser `
      -PgDatabase $pgDatabase

    if ($quotedDeviceIds.Count -gt 0) {
      $deviceListSql = $quotedDeviceIds -join ","
      Invoke-ClickHouseBatch `
        -Query "SET mutations_sync = 2; ALTER TABLE telemetry_raw DELETE WHERE device_id IN ($deviceListSql);" `
        -ComposePath $resolvedComposeFile `
        -EnvPath $resolvedEnvFile `
        -ChUser $chUser `
        -ChPassword $chPassword `
        -ChDatabase $chDatabase
    }
  }

  $remainingDevices = Get-IsolatedDevices -ComposePath $resolvedComposeFile -EnvPath $resolvedEnvFile -PgUser $pgUser -PgDatabase $pgDatabase
  $remainingStations = Get-IsolatedStations -ComposePath $resolvedComposeFile -EnvPath $resolvedEnvFile -PgUser $pgUser -PgDatabase $pgDatabase
  $countsAfter = Get-IsolatedCounts `
    -DeviceIds @($remainingDevices | ForEach-Object { $_.deviceId } | Where-Object { $_ }) `
    -StationIds @($remainingStations | ForEach-Object { $_.stationId } | Where-Object { $_ }) `
    -ComposePath $resolvedComposeFile `
    -EnvPath $resolvedEnvFile `
    -PgUser $pgUser `
    -PgDatabase $pgDatabase `
    -ChUser $chUser `
    -ChPassword $chPassword `
    -ChDatabase $chDatabase
  $isolatedDevices = $remainingDevices
  $isolatedStations = $remainingStations
}

[pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  mode = "purge-isolated-field-data"
  apply = [bool]$Apply.IsPresent
  isolatedDeviceCount = @($isolatedDevices).Count
  isolatedStationCount = @($isolatedStations).Count
  isolatedDevices = @($isolatedDevices)
  isolatedStations = @($isolatedStations)
  countsBefore = $countsBefore
  countsAfter = $countsAfter
} | ConvertTo-Json -Depth 8
