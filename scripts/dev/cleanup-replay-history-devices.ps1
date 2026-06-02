[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeBase = "infra/compose/docker-compose.yml",
  [switch]$Apply
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

function Invoke-PostgresJson([string]$Sql, [string]$ComposeFile, [string]$EnvPath, [string]$PgUser, [string]$PgDatabase) {
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    Set-Content -Path $tmp -Value $Sql -Encoding UTF8
    $output = Get-Content -Path $tmp -Raw -Encoding UTF8 | docker compose -f $ComposeFile --env-file $EnvPath exec -T postgres `
      psql -U $PgUser -d $PgDatabase -t -A -F "`t" -f -
    if ($LASTEXITCODE -ne 0) {
      throw "postgres command failed (exit=$LASTEXITCODE)"
    }
    return @($output | Where-Object { $_ -and $_.Trim() })
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

$repoRoot = Resolve-RepoRoot
$resolvedEnvFile = Join-Path $repoRoot $EnvFile
$resolvedComposeBase = Join-Path $repoRoot $ComposeBase
if (-not (Test-Path $resolvedEnvFile)) { throw "env file not found: $resolvedEnvFile" }
if (-not (Test-Path $resolvedComposeBase)) { throw "compose file not found: $resolvedComposeBase" }

$envMap = Read-DotEnv $resolvedEnvFile
$pgUser = [string]$envMap["PG_USER"]
$pgDatabase = [string]$envMap["PG_DATABASE"]
$chUser = [string]$envMap["CH_USER"]
$chPassword = [string]$envMap["CH_PASSWORD"]
$chDatabase = [string]$envMap["CH_DATABASE"]

$selectSql = @"
SELECT device_id::text, device_name
FROM devices
WHERE device_name LIKE 'field-hardware-replay-%'
   OR COALESCE(metadata->>'note', '') = 'field_hardware_uplink_replay'
ORDER BY created_at DESC;
"@

$deviceRows = Invoke-PostgresJson -Sql $selectSql -ComposeFile $resolvedComposeBase -EnvPath $resolvedEnvFile -PgUser $pgUser -PgDatabase $pgDatabase
$devices = @(
  foreach ($row in $deviceRows) {
    $parts = $row -split "`t", 2
    if ($parts.Count -lt 2) { continue }
    [pscustomobject]@{
      deviceId = $parts[0].Trim()
      deviceName = $parts[1].Trim()
    }
  }
)

$deviceIds = @($devices | ForEach-Object { $_.deviceId } | Where-Object { $_ })
$quotedIds = @($deviceIds | ForEach-Object { "'$_'" })
$idListSql = if ($quotedIds.Count -gt 0) { $quotedIds -join "," } else { "" }

$counts = [ordered]@{
  replayDevices = $deviceIds.Count
  postgres = [ordered]@{
    device_state = 0
    ai_predictions = 0
    device_commands = 0
    device_command_events = 0
    device_presence = 0
    alert_events = 0
  }
  clickhouse = [ordered]@{
    telemetry_raw = 0
  }
}

if ($deviceIds.Count -gt 0) {
  $countSql = @"
SELECT 'device_state', count(*)::text FROM device_state WHERE device_id IN ($idListSql)
UNION ALL
SELECT 'ai_predictions', count(*)::text FROM ai_predictions WHERE device_id IN ($idListSql)
UNION ALL
SELECT 'device_commands', count(*)::text FROM device_commands WHERE device_id IN ($idListSql)
UNION ALL
SELECT 'device_command_events', count(*)::text
FROM device_command_events
WHERE command_id IN (SELECT command_id FROM device_commands WHERE device_id IN ($idListSql))
UNION ALL
SELECT 'device_presence', count(*)::text FROM device_presence WHERE device_id IN ($idListSql)
UNION ALL
SELECT 'alert_events', count(*)::text FROM alert_events WHERE device_id IN ($idListSql);
"@
  foreach ($row in Invoke-PostgresJson -Sql $countSql -ComposeFile $resolvedComposeBase -EnvPath $resolvedEnvFile -PgUser $pgUser -PgDatabase $pgDatabase) {
    $parts = $row -split "`t", 2
    if ($parts.Count -lt 2) { continue }
    $counts.postgres[$parts[0].Trim()] = [int]$parts[1].Trim()
  }

  $clickhouseCount = docker exec lsmv2_clickhouse clickhouse-client `
    --user $chUser `
    --password $chPassword `
    --database $chDatabase `
    --query "SELECT count() FROM telemetry_raw WHERE device_id IN ($idListSql)"
  if ($LASTEXITCODE -ne 0) {
    throw "clickhouse count failed (exit=$LASTEXITCODE)"
  }
  $counts.clickhouse.telemetry_raw = [int](($clickhouseCount | Select-Object -First 1).ToString().Trim())
}

if ($Apply.IsPresent -and $deviceIds.Count -gt 0) {
  $deleteSql = @"
DELETE FROM devices
WHERE device_id IN ($idListSql);
"@
  Invoke-PostgresJson -Sql $deleteSql -ComposeFile $resolvedComposeBase -EnvPath $resolvedEnvFile -PgUser $pgUser -PgDatabase $pgDatabase | Out-Null

  docker exec lsmv2_clickhouse clickhouse-client `
    --user $chUser `
    --password $chPassword `
    --database $chDatabase `
    --multiquery `
    --query "SET mutations_sync = 2; ALTER TABLE telemetry_raw DELETE WHERE device_id IN ($idListSql);"
  if ($LASTEXITCODE -ne 0) {
    throw "clickhouse delete failed (exit=$LASTEXITCODE)"
  }
}

[pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  mode = "cleanup-replay-history-devices"
  apply = [bool]$Apply.IsPresent
  replayDeviceCount = $deviceIds.Count
  replayDevices = @($devices)
  counts = $counts
} | ConvertTo-Json -Depth 6
