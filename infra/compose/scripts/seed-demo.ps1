param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml"
)

$ErrorActionPreference = "Stop"

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
  throw "Missing env file: $EnvFile (copy infra/compose/env.example -> infra/compose/.env)"
}

$null = Import-EnvFile $EnvFile

Write-Host "Seeding demo data (Postgres + ClickHouse)..." -ForegroundColor Cyan

Write-Host "Waiting for PostgreSQL..." -ForegroundColor Cyan
$maxWaitSeconds = 90
$start = Get-Date
while ($true) {
  docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -U $env:PG_USER -d $env:PG_DATABASE -c "SELECT 1;" 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  if (((Get-Date) - $start).TotalSeconds -gt $maxWaitSeconds) {
    throw "PostgreSQL is not ready after ${maxWaitSeconds}s. Check: docker compose logs postgres"
  }
  Start-Sleep -Seconds 2
}
Write-Host "PostgreSQL is ready." -ForegroundColor Green

$pgSeed = @"
INSERT INTO stations (station_code, station_name, latitude, longitude, metadata)
VALUES
  ('DEMO001', '示例监测点A', 22.684700, 108.351600, '{"note":"seed demo"}'::jsonb)
ON CONFLICT (station_code) DO UPDATE
SET station_name = EXCLUDED.station_name,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    updated_at = NOW();

INSERT INTO devices (device_id, device_name, device_type, station_id, status, device_secret_hash, metadata, last_seen_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'device_1', 'multi_sensor', (SELECT station_id FROM stations WHERE station_code='DEMO001'), 'active', 'dev-seed', '{"legacy_device_id":"device_1","chart_legend_name":"1号监测点"}'::jsonb, NOW()),
  ('00000000-0000-0000-0000-000000000002', 'device_2', 'multi_sensor', (SELECT station_id FROM stations WHERE station_code='DEMO001'), 'active', 'dev-seed', '{"legacy_device_id":"device_2","chart_legend_name":"2号监测点"}'::jsonb, NOW()),
  ('00000000-0000-0000-0000-000000000003', 'device_3', 'multi_sensor', (SELECT station_id FROM stations WHERE station_code='DEMO001'), 'active', 'dev-seed', '{"legacy_device_id":"device_3","chart_legend_name":"3号监测点"}'::jsonb, NOW())
ON CONFLICT (device_id) DO UPDATE
SET device_name = EXCLUDED.device_name,
    device_type = EXCLUDED.device_type,
    station_id = EXCLUDED.station_id,
    status = EXCLUDED.status,
    metadata = EXCLUDED.metadata,
    last_seen_at = EXCLUDED.last_seen_at,
    updated_at = NOW();

INSERT INTO gps_baselines (device_id, method, points_count, baseline, computed_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'manual', 240, '{"latitude":22.684700,"longitude":108.351600,"altitude":12.3,"establishedBy":"seed","notes":"demo baseline"}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000002', 'manual', 240, '{"latitude":22.684950,"longitude":108.351900,"altitude":12.4,"establishedBy":"seed","notes":"demo baseline"}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000003', 'manual', 240, '{"latitude":22.684450,"longitude":108.351300,"altitude":12.2,"establishedBy":"seed","notes":"demo baseline"}'::jsonb, NOW(), NOW())
ON CONFLICT (device_id) DO UPDATE
SET method = EXCLUDED.method,
    points_count = EXCLUDED.points_count,
    baseline = EXCLUDED.baseline,
    computed_at = EXCLUDED.computed_at,
    updated_at = NOW();
"@

$pgSeed | docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -v ON_ERROR_STOP=1 -U $env:PG_USER -d $env:PG_DATABASE 1>$null
Assert-LastExitCode "psql failed: seed demo data"
Write-Host "PostgreSQL seed done." -ForegroundColor Green

Write-Host "Waiting for ClickHouse..." -ForegroundColor Cyan
$start = Get-Date
while ($true) {
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:8123/ping" -TimeoutSec 2
    if ($resp.StatusCode -eq 200 -and $resp.Content -match "Ok") { break }
  } catch {
    # ignore
  }
  if (((Get-Date) - $start).TotalSeconds -gt $maxWaitSeconds) {
    throw "ClickHouse is not ready after ${maxWaitSeconds}s. Check: docker compose logs clickhouse"
  }
  Start-Sleep -Seconds 2
}
Write-Host "ClickHouse is ready." -ForegroundColor Green

$chUser = $env:CH_USER
if (-not $chUser) { $chUser = "landslide" }
$chPassword = $env:CH_PASSWORD
if (-not $chPassword) { $chPassword = "change-me" }
$chDatabase = $env:CH_DATABASE
if (-not $chDatabase) { $chDatabase = "landslide" }

$chInsertTemplate = @"
INSERT INTO landslide.telemetry_raw
(received_ts, event_ts, device_id, sensor_key, seq, value_f64, value_i64, value_str, value_bool, quality, schema_version)
SELECT
  now64(3, 'UTC') - toIntervalMinute(number) AS received_ts,
  NULL AS event_ts,
  '{DEVICE_ID}' AS device_id,
  sensor_key,
  toUInt64(number) AS seq,
  multiIf(
    sensor_key = 'gps_latitude',  {LAT_BASE} + ({LAT_JITTER}/10000000.0),
    sensor_key = 'gps_longitude', {LON_BASE} + ({LON_JITTER}/10000000.0),
    sensor_key = 'temperature_c', 22.0 + (rand64() % 600) / 100.0,
    sensor_key = 'humidity_pct',  60.0 + (rand64() % 2000) / 100.0,
    sensor_key = 'illumination',  800.0 + (rand64() % 400),
    sensor_key = 'acceleration_x', (rand64() % 2000) / 1000.0,
    sensor_key = 'acceleration_y', (rand64() % 2000) / 1000.0,
    sensor_key = 'acceleration_z', (rand64() % 2000) / 1000.0,
    sensor_key = 'gyroscope_x',   (rand64() % 2000) / 10.0,
    sensor_key = 'gyroscope_y',   (rand64() % 2000) / 10.0,
    sensor_key = 'gyroscope_z',   (rand64() % 2000) / 10.0,
    NULL
  ) AS value_f64,
  NULL AS value_i64,
  NULL AS value_str,
  NULL AS value_bool,
  1 AS quality,
  1 AS schema_version
FROM numbers(240)
ARRAY JOIN [
  'gps_latitude',
  'gps_longitude',
  'temperature_c',
  'humidity_pct',
  'illumination',
  'acceleration_x',
  'acceleration_y',
  'acceleration_z',
  'gyroscope_x',
  'gyroscope_y',
  'gyroscope_z'
] AS sensor_key;
"@

function Seed-ClickhouseDevice([string]$deviceId, [double]$latBase, [double]$lonBase) {
  $sql = $chInsertTemplate.Replace("{DEVICE_ID}", $deviceId)
  $sql = $sql.Replace("{LAT_BASE}", [string]$latBase)
  $sql = $sql.Replace("{LON_BASE}", [string]$lonBase)
  $sql = $sql.Replace("{LAT_JITTER}", "(rand64() % 1000)")
  $sql = $sql.Replace("{LON_JITTER}", "(rand64() % 1000)")

  $sql | docker compose -f $ComposeFile --env-file $EnvFile exec -T clickhouse clickhouse-client --user $chUser --password $chPassword --database $chDatabase --multiquery 1>$null
  Assert-LastExitCode "clickhouse-client failed: seed $deviceId"
}

Seed-ClickhouseDevice "00000000-0000-0000-0000-000000000001" 22.684700 108.351600
Seed-ClickhouseDevice "00000000-0000-0000-0000-000000000002" 22.684950 108.351900
Seed-ClickhouseDevice "00000000-0000-0000-0000-000000000003" 22.684450 108.351300

Write-Host "ClickHouse seed done." -ForegroundColor Green
Write-Host "Demo seed complete." -ForegroundColor Green

