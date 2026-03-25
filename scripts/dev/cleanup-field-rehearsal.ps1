[CmdletBinding()]
param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml",
  [switch]$ListOnly
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Import-EnvFile([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing env file: $path" }
  $lines = Get-Content -Encoding UTF8 $path
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t.Length -eq 0) { continue }
    if ($t.StartsWith("#")) { continue }
    $idx = $t.IndexOf("=")
    if ($idx -lt 1) { continue }
    $key = $t.Substring(0, $idx).Trim()
    $val = $t.Substring($idx + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Trim('"') }
    if ($val.StartsWith("'") -and $val.EndsWith("'")) { $val = $val.Trim("'") }
    Set-Item -Path "env:$key" -Value $val
  }
}

function Assert-LastExitCode([string]$message) {
  if ($LASTEXITCODE -ne 0) { throw "$message (exit=$LASTEXITCODE)" }
}

if (-not (Test-Path $EnvFile)) {
  throw "Missing env file: $EnvFile"
}

Import-EnvFile $EnvFile

$pgUser = if ($env:PG_USER) { $env:PG_USER } else { "landslide" }
$pgDb = if ($env:PG_DATABASE) { $env:PG_DATABASE } else { "landslide_monitor" }
$chUser = if ($env:CH_USER) { $env:CH_USER } else { "landslide" }
$chPassword = if ($env:CH_PASSWORD) { $env:CH_PASSWORD } else { "change-me" }
$chDb = if ($env:CH_DATABASE) { $env:CH_DATABASE } else { "landslide" }

$listSql = @"
SELECT json_agg(
  json_build_object(
    'device_id', device_id,
    'device_name', device_name,
    'status', status,
    'created_at', created_at,
    'last_seen_at', last_seen_at
  )
)
FROM devices
WHERE COALESCE(metadata->>'note','') = 'field_rehearsal';
"@

$listed = $listSql | docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -U $pgUser -d $pgDb -At
Assert-LastExitCode "psql failed to list field rehearsal devices"
$listedText = ($listed | Out-String).Trim()
if (-not $listedText -or $listedText -eq "null") {
  $empty = [pscustomobject]@{
    found = 0
    devices = @()
  } | ConvertTo-Json -Depth 6
  $empty
  exit 0
}

$devices = $listedText | ConvertFrom-Json
$deviceIds = @($devices | ForEach-Object { $_.device_id })

if ($ListOnly) {
  [pscustomobject]@{
    found = @($deviceIds).Count
    devices = @($devices)
  } | ConvertTo-Json -Depth 6
  exit 0
}

$cleanupSql = @"
DELETE FROM alert_notifications
WHERE user_id IN (SELECT user_id FROM users WHERE username LIKE 'field_rehearsal_%');

DELETE FROM user_alert_subscriptions
WHERE user_id IN (SELECT user_id FROM users WHERE username LIKE 'field_rehearsal_%')
   OR device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'field_rehearsal');

DELETE FROM alert_events
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'field_rehearsal');

DELETE FROM ai_predictions
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'field_rehearsal');

DELETE FROM device_command_events
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'field_rehearsal');

DELETE FROM device_commands
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'field_rehearsal');

DELETE FROM device_presence
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'field_rehearsal');

DELETE FROM device_state
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'field_rehearsal');

DELETE FROM gps_baselines
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'field_rehearsal');

DELETE FROM devices
WHERE COALESCE(metadata->>'note','') = 'field_rehearsal';
"@

$cleanupSql | docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -v ON_ERROR_STOP=1 -U $pgUser -d $pgDb 1>$null
Assert-LastExitCode "psql failed to cleanup field rehearsal data"

if (@($deviceIds).Count -gt 0) {
  $quotedIds = ($deviceIds | ForEach-Object { "'" + $_ + "'" }) -join ","
  $chSql = "ALTER TABLE $chDb.telemetry_raw DELETE WHERE device_id IN ($quotedIds);"
  $chSql | docker compose -f $ComposeFile --env-file $EnvFile exec -T clickhouse clickhouse-client --user $chUser --password $chPassword --database $chDb --multiquery 1>$null
  Assert-LastExitCode "clickhouse-client failed to cleanup field rehearsal telemetry"
}

[pscustomobject]@{
  cleaned = @($deviceIds).Count
  deviceIds = @($deviceIds)
  clickhouseDeleteIssued = (@($deviceIds).Count -gt 0)
} | ConvertTo-Json -Depth 6
