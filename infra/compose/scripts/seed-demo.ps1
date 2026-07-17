param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml"
)

$ErrorActionPreference = "Stop"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

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

function Invoke-PostgresSqlText([string]$sql, [string]$label) {
  $normalizedSql = $sql.TrimStart([char]0xFEFF)
  $normalizedSql | docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -v ON_ERROR_STOP=1 -U $env:PG_USER -d $env:PG_DATABASE 1>$null
  Assert-LastExitCode "psql failed: $label"
}

if (-not (Test-Path $EnvFile)) {
  throw "Missing env file: $EnvFile (copy infra/compose/env.example -> infra/compose/.env)"
}

$seedMutex = [System.Threading.Mutex]::new($false, "Global\LSMV2-SeedDemo")
$seedMutexAcquired = $false

try {
  $seedMutexAcquired = $seedMutex.WaitOne([TimeSpan]::FromMinutes(10))
  if (-not $seedMutexAcquired) {
    throw "Timeout waiting for seed demo mutex"
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

$pgSeed = @'
DELETE FROM alert_notifications
WHERE user_id IN (SELECT user_id FROM users WHERE username LIKE 'smoke_user_%');

DELETE FROM user_alert_subscriptions
WHERE user_id IN (SELECT user_id FROM users WHERE username LIKE 'smoke_user_%')
   OR device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'smoke_test');

DELETE FROM alert_events
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'smoke_test');

DELETE FROM alert_events
WHERE title LIKE '演示告警%';

DELETE FROM ai_predictions
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'smoke_test');

DELETE FROM device_command_events
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'smoke_test');

DELETE FROM device_commands
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'smoke_test');

DELETE FROM device_presence
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'smoke_test');

DELETE FROM device_state
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'smoke_test');

DELETE FROM gps_baselines
WHERE device_id IN (SELECT device_id FROM devices WHERE COALESCE(metadata->>'note','') = 'smoke_test');

DELETE FROM devices
WHERE COALESCE(metadata->>'note','') = 'smoke_test';

DELETE FROM users
WHERE username LIKE 'smoke_user_%';

CREATE TEMP TABLE seed_demo_device_ids (device_id UUID PRIMARY KEY);

INSERT INTO seed_demo_device_ids (device_id)
SELECT d.device_id
FROM devices d
LEFT JOIN stations s ON s.station_id = d.station_id
WHERE d.device_id IN (
    '30000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000005',
    '30000000-0000-0000-0000-000000000006'
  )
   OR (
    d.device_name IN ('device_1', 'device_2', 'device_3', 'device_4', 'device_5', 'device_6')
    AND COALESCE(s.station_code, '') IN ('DEMO001', 'DEMO002')
   )
   OR COALESCE(d.metadata->>'note', '') = 'seed demo';

DELETE FROM alert_events
WHERE device_id IN (SELECT device_id FROM seed_demo_device_ids);

DELETE FROM ai_predictions
WHERE device_id IN (SELECT device_id FROM seed_demo_device_ids);

DELETE FROM device_command_events
WHERE device_id IN (SELECT device_id FROM seed_demo_device_ids);

DELETE FROM device_commands
WHERE device_id IN (SELECT device_id FROM seed_demo_device_ids);

DELETE FROM device_presence
WHERE device_id IN (SELECT device_id FROM seed_demo_device_ids);

DELETE FROM device_state
WHERE device_id IN (SELECT device_id FROM seed_demo_device_ids);

DELETE FROM gps_baselines
WHERE device_id IN (SELECT device_id FROM seed_demo_device_ids);

DELETE FROM devices
WHERE device_id IN (SELECT device_id FROM seed_demo_device_ids);

INSERT INTO stations (station_code, station_name, latitude, longitude, metadata)
VALUES
  (
    'DEMO001',
    convert_from(decode('e7a4bae4be8be79b91e6b58be782b941', 'hex'), 'UTF8'),
    22.684700,
    108.351600,
    jsonb_build_object(
      'note', 'seed demo',
      'locationName', convert_from(decode('e7a4bae4be8be79b91e6b58be58cba41', 'hex'), 'UTF8'),
      'riskLevel', 'medium',
      'risk_level', 'medium'
    )
  ),
  (
    'DEMO002',
    convert_from(decode('e7a4bae4be8be79b91e6b58be782b942', 'hex'), 'UTF8'),
    22.689200,
    108.357900,
    jsonb_build_object(
      'note', 'seed demo',
      'locationName', convert_from(decode('e7a4bae4be8be79b91e6b58be58cba42', 'hex'), 'UTF8'),
      'riskLevel', 'low',
      'risk_level', 'low'
    )
  )
ON CONFLICT (station_code) DO UPDATE
SET station_name = EXCLUDED.station_name,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

INSERT INTO devices (device_id, device_name, device_type, station_id, status, device_secret_hash, metadata, last_seen_at)
VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    'device_1',
    'multi_sensor',
    (SELECT station_id FROM stations WHERE station_code='DEMO001'),
    'active',
    'dev-seed',
    jsonb_build_object(
      'note', 'seed demo',
      'identityClass', 'seed',
      'legacy_device_id', 'device_1',
      'chart_legend_name', convert_from(decode('31e58fb7e79b91e6b58be782b9', 'hex'), 'UTF8'),
      'station_name', convert_from(decode('e7a4bae4be8be79b91e6b58be782b941', 'hex'), 'UTF8'),
      'location_name', convert_from(decode('e7a4bae4be8be79b91e6b58be58cba41', 'hex'), 'UTF8'),
      'risk_level', 'medium',
      'sensor_types', to_jsonb(ARRAY['gnss','temperature','humidity','acceleration','gyroscope'])
    ),
    NOW()
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    'device_2',
    'multi_sensor',
    (SELECT station_id FROM stations WHERE station_code='DEMO001'),
    'active',
    'dev-seed',
    jsonb_build_object(
      'note', 'seed demo',
      'identityClass', 'seed',
      'legacy_device_id', 'device_2',
      'chart_legend_name', convert_from(decode('32e58fb7e79b91e6b58be782b9', 'hex'), 'UTF8'),
      'station_name', convert_from(decode('e7a4bae4be8be79b91e6b58be782b941', 'hex'), 'UTF8'),
      'location_name', convert_from(decode('e7a4bae4be8be79b91e6b58be58cba41', 'hex'), 'UTF8'),
      'risk_level', 'medium',
      'sensor_types', to_jsonb(ARRAY['gnss','temperature','humidity','acceleration','gyroscope'])
    ),
    NOW()
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    'device_3',
    'multi_sensor',
    (SELECT station_id FROM stations WHERE station_code='DEMO001'),
    'active',
    'dev-seed',
    jsonb_build_object(
      'note', 'seed demo',
      'identityClass', 'seed',
      'legacy_device_id', 'device_3',
      'chart_legend_name', convert_from(decode('33e58fb7e79b91e6b58be782b9', 'hex'), 'UTF8'),
      'station_name', convert_from(decode('e7a4bae4be8be79b91e6b58be782b941', 'hex'), 'UTF8'),
      'location_name', convert_from(decode('e7a4bae4be8be79b91e6b58be58cba41', 'hex'), 'UTF8'),
      'risk_level', 'medium',
      'sensor_types', to_jsonb(ARRAY['gnss','temperature','humidity','acceleration','gyroscope'])
    ),
    NOW()
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    'device_4',
    'rain',
    (SELECT station_id FROM stations WHERE station_code='DEMO002'),
    'inactive',
    'dev-seed',
    jsonb_build_object(
      'note', 'seed demo',
      'identityClass', 'seed',
      'legacy_device_id', 'device_4',
      'chart_legend_name', convert_from(decode('34e58fb7e79b91e6b58be782b9', 'hex'), 'UTF8'),
      'station_name', convert_from(decode('e7a4bae4be8be79b91e6b58be782b942', 'hex'), 'UTF8'),
      'location_name', convert_from(decode('e7a4bae4be8be79b91e6b58be58cba42', 'hex'), 'UTF8'),
      'risk_level', 'low',
      'sensor_types', to_jsonb(ARRAY['rain'])
    ),
    NOW() - INTERVAL '3 days'
  ),
  (
    '30000000-0000-0000-0000-000000000005',
    'device_5',
    'tilt',
    (SELECT station_id FROM stations WHERE station_code='DEMO002'),
    'active',
    'dev-seed',
    jsonb_build_object(
      'note', 'seed demo',
      'identityClass', 'seed',
      'legacy_device_id', 'device_5',
      'chart_legend_name', convert_from(decode('35e58fb7e79b91e6b58be782b9', 'hex'), 'UTF8'),
      'station_name', convert_from(decode('e7a4bae4be8be79b91e6b58be782b942', 'hex'), 'UTF8'),
      'location_name', convert_from(decode('e7a4bae4be8be79b91e6b58be58cba42', 'hex'), 'UTF8'),
      'risk_level', 'low',
      'sensor_types', to_jsonb(ARRAY['tilt'])
    ),
    NOW() - INTERVAL '2 days'
  ),
  (
    '30000000-0000-0000-0000-000000000006',
    'device_6',
    'gnss',
    (SELECT station_id FROM stations WHERE station_code='DEMO002'),
    'active',
    'dev-seed',
    jsonb_build_object(
      'note', 'seed demo',
      'identityClass', 'seed',
      'legacy_device_id', 'device_6',
      'chart_legend_name', convert_from(decode('36e58fb7e79b91e6b58be782b9', 'hex'), 'UTF8'),
      'station_name', convert_from(decode('e7a4bae4be8be79b91e6b58be782b942', 'hex'), 'UTF8'),
      'location_name', convert_from(decode('e7a4bae4be8be79b91e6b58be58cba42', 'hex'), 'UTF8'),
      'risk_level', 'low',
      'sensor_types', to_jsonb(ARRAY['gnss'])
    ),
    NOW() - INTERVAL '2 days'
  )
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
  (
    '30000000-0000-0000-0000-000000000001',
    'manual',
    240,
    '{"latitude":22.684700,"longitude":108.351600,"altitude":12.3,"positionAccuracyMeters":1.2,"satelliteCount":12,"establishedBy":"seed","notes":"demo baseline"}'::jsonb,
    NOW(),
    NOW()
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    'manual',
    240,
    '{"latitude":22.684950,"longitude":108.351900,"altitude":12.4,"positionAccuracyMeters":1.3,"satelliteCount":11,"establishedBy":"seed","notes":"demo baseline"}'::jsonb,
    NOW(),
    NOW()
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    'manual',
    240,
    '{"latitude":22.684450,"longitude":108.351300,"altitude":12.2,"positionAccuracyMeters":1.1,"satelliteCount":13,"establishedBy":"seed","notes":"demo baseline"}'::jsonb,
    NOW(),
    NOW()
  )
ON CONFLICT (device_id) DO UPDATE
SET method = EXCLUDED.method,
    points_count = EXCLUDED.points_count,
    baseline = EXCLUDED.baseline,
    computed_at = EXCLUDED.computed_at,
    updated_at = NOW();

'@

Invoke-PostgresSqlText $pgSeed "seed demo data"
Write-Host "PostgreSQL seed done." -ForegroundColor Green

$pgRoleSeed = @'
UPDATE roles
SET display_name = CASE role_name
      WHEN 'super_admin' THEN 'Super Admin'
      WHEN 'admin' THEN 'Admin'
      WHEN 'user' THEN 'User'
      ELSE display_name
    END,
    description = CASE role_name
      WHEN 'super_admin' THEN 'Full system access'
      WHEN 'admin' THEN 'Device, alert and data operations'
      WHEN 'user' THEN 'Read-only monitoring access'
      ELSE description
    END,
    updated_at = NOW()
WHERE role_name IN ('super_admin', 'admin', 'user');
'@

Invoke-PostgresSqlText $pgRoleSeed "seed demo roles"
Write-Host "PostgreSQL role seed done." -ForegroundColor Green

$pgSystemConfigSeed = @'
INSERT INTO system_configs (config_key, config_value, config_type, description, is_public)
VALUES
  ('gps.displacement_threshold_blue_mm', '2', 'number', 'GPS blue threshold mm', TRUE),
  ('gps.displacement_threshold_yellow_mm', '5', 'number', 'GPS yellow threshold mm', TRUE),
  ('gps.displacement_threshold_red_mm', '8', 'number', 'GPS red threshold mm', TRUE),
  ('gps.data_limit', '200', 'number', 'GPS data limit', TRUE)
ON CONFLICT (config_key) DO UPDATE
SET config_value = EXCLUDED.config_value,
    config_type = EXCLUDED.config_type,
    description = EXCLUDED.description,
    is_public = EXCLUDED.is_public,
    updated_at = NOW();
'@

Invoke-PostgresSqlText $pgSystemConfigSeed "seed demo system configs"
Write-Host "PostgreSQL system config seed done." -ForegroundColor Green

$pgAuthSeed = @'
DELETE FROM user_roles
WHERE user_id IN (
  SELECT user_id
  FROM users
  WHERE username IN ('admin', 'viewer')
    AND user_id <> '20000000-0000-0000-0000-000000000001'::uuid
);

DELETE FROM users
WHERE username IN ('admin', 'viewer')
  AND user_id NOT IN (
    '20000000-0000-0000-0000-000000000001'::uuid,
    '20000000-0000-0000-0000-000000000002'::uuid
  );

INSERT INTO users (
  user_id,
  username,
  password_hash,
  email,
  real_name,
  status,
  deleted_at
)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  'admin',
  '$2b$10$tVOq3ED2r0XZm.zhKj1dc.bVLbt4fa5HN3lvVzDqTacYHyEGn8n6e',
  'admin@example.com',
  'Local Admin',
  'active',
  NULL
)
ON CONFLICT (user_id) DO UPDATE
SET username = EXCLUDED.username,
    password_hash = EXCLUDED.password_hash,
    email = EXCLUDED.email,
    real_name = EXCLUDED.real_name,
    status = EXCLUDED.status,
    deleted_at = NULL,
    updated_at = NOW();

INSERT INTO user_roles (user_id, role_id)
SELECT
  '20000000-0000-0000-0000-000000000001'::uuid,
  role_id
FROM roles
WHERE role_name = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO users (
  user_id,
  username,
  password_hash,
  email,
  real_name,
  status,
  deleted_at
)
VALUES (
  '20000000-0000-0000-0000-000000000002',
  'viewer',
  '$2b$10$tVOq3ED2r0XZm.zhKj1dc.bVLbt4fa5HN3lvVzDqTacYHyEGn8n6e',
  'viewer@example.com',
  'Local Viewer',
  'active',
  NULL
)
ON CONFLICT (user_id) DO UPDATE
SET username = EXCLUDED.username,
    password_hash = EXCLUDED.password_hash,
    email = EXCLUDED.email,
    real_name = EXCLUDED.real_name,
    status = EXCLUDED.status,
    deleted_at = NULL,
    updated_at = NOW();

INSERT INTO user_roles (user_id, role_id)
SELECT
  '20000000-0000-0000-0000-000000000002'::uuid,
  role_id
FROM roles
WHERE role_name = 'user'
ON CONFLICT DO NOTHING;
'@

Invoke-PostgresSqlText $pgAuthSeed "seed demo auth user"
Write-Host "PostgreSQL auth seed done." -ForegroundColor Green

$pgAlertSeed = @"
DELETE FROM alert_events
WHERE alert_id IN (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
)
   OR title LIKE '演示告警%';

INSERT INTO alert_events (
  alert_id,
  event_type,
  device_id,
  station_id,
  severity,
  title,
  message,
  created_at
)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    'ALERT_TRIGGER',
    '30000000-0000-0000-0000-000000000001',
    (SELECT station_id FROM stations WHERE station_code='DEMO001'),
    'medium',
    convert_from(decode('e6bc94e7a4bae5918ae8ada62d31', 'hex'), 'UTF8'),
    convert_from(decode('e6bc94e7a4bae4bd8de7a7bbe6b3a2e58aa8e9a284e8ada6', 'hex'), 'UTF8'),
    NOW() - INTERVAL '2 days'
  );

INSERT INTO alert_events (
  alert_id,
  event_type,
  device_id,
  station_id,
  severity,
  title,
  message,
  created_at
)
VALUES
  (
    '10000000-0000-0000-0000-000000000002',
    'ALERT_TRIGGER',
    '30000000-0000-0000-0000-000000000002',
    (SELECT station_id FROM stations WHERE station_code='DEMO001'),
    'high',
    convert_from(decode('e6bc94e7a4bae5918ae8ada62d32', 'hex'), 'UTF8'),
    convert_from(decode('e6bc94e7a4bae9ab98e9a38ee999a9e9a284e8ada6', 'hex'), 'UTF8'),
    NOW() - INTERVAL '1 day'
  );

INSERT INTO alert_events (
  alert_id,
  event_type,
  device_id,
  station_id,
  severity,
  title,
  message,
  created_at
)
VALUES
  (
    '10000000-0000-0000-0000-000000000003',
    'ALERT_TRIGGER',
    '30000000-0000-0000-0000-000000000003',
    (SELECT station_id FROM stations WHERE station_code='DEMO001'),
    'low',
    convert_from(decode('e6bc94e7a4bae5918ae8ada62d33', 'hex'), 'UTF8'),
    convert_from(decode('e6bc94e7a4bae4bd8ee9a38ee999a9e9a284e8ada6', 'hex'), 'UTF8'),
    NOW()
  );
"@

Invoke-PostgresSqlText $pgAlertSeed "seed demo alerts"
Write-Host "PostgreSQL alert seed done." -ForegroundColor Green

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

$chCleanupSql = @"
SET mutations_sync = 2;
ALTER TABLE landslide.telemetry_raw DELETE
WHERE device_id IN (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000004',
  '30000000-0000-0000-0000-000000000005',
  '30000000-0000-0000-0000-000000000006'
);
"@

$chCleanupSql | docker compose -f $ComposeFile --env-file $EnvFile exec -T clickhouse clickhouse-client --user $chUser --password $chPassword --database $chDatabase --multiquery 1>$null
Assert-LastExitCode "clickhouse-client failed: cleanup demo telemetry"
Write-Host "ClickHouse cleanup done." -ForegroundColor Green

$chInsertTemplate = @"
INSERT INTO landslide.telemetry_raw
(received_ts, event_ts, device_id, sensor_key, seq, value_f64, value_i64, value_str, value_bool, quality, schema_version)
SELECT
  now64(3, 'UTC') - toIntervalHour(number) AS received_ts,
  NULL AS event_ts,
  '{DEVICE_ID}' AS device_id,
  sensor_key,
  toUInt64(number) AS seq,
  multiIf(
    sensor_key = 'gps_latitude',
      {LAT_BASE}
      + ({LAT_DRIFT_PER_HOUR} * toFloat64(719 - number))
      + ({LAT_SEASONAL_AMPLITUDE} * sin((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / 24.0 * 2.0 * pi()))
      + ({LAT_EVENT_AMPLITUDE} * exp(-pow((toFloat64(719 - number) - {EVENT_CENTER_HOURS}) / 28.0, 2))),
    sensor_key = 'gps_longitude',
      {LON_BASE}
      + ({LON_DRIFT_PER_HOUR} * toFloat64(719 - number))
      + ({LON_SEASONAL_AMPLITUDE} * cos((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / (24.0 * 5.0) * 2.0 * pi()))
      + ({LON_EVENT_AMPLITUDE} * exp(-pow((toFloat64(719 - number) - {EVENT_CENTER_HOURS}) / 32.0, 2))),
    sensor_key = 'gps_altitude',
      {ALT_BASE}
      + 0.010 * sin((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / 24.0 * 2.0 * pi())
      + 0.018 * exp(-pow((toFloat64(719 - number) - {EVENT_CENTER_HOURS}) / 30.0, 2)),
    sensor_key = 'temperature_c',
      19.5
      + 4.6 * sin((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / 24.0 * 2.0 * pi())
      + 1.2 * cos((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / (24.0 * 7.0) * 2.0 * pi()),
    sensor_key = 'humidity_pct',
      68.0
      - 8.0 * sin((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / 24.0 * 2.0 * pi())
      + 3.0 * cos((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / (24.0 * 6.0) * 2.0 * pi()),
    sensor_key = 'illumination',
      greatest(120.0, 760.0 + 180.0 * sin((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / 24.0 * 2.0 * pi())),
    sensor_key = 'acceleration_x',
      0.012 * sin((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / 8.0 * 2.0 * pi())
      + 0.020 * exp(-pow((toFloat64(719 - number) - {EVENT_CENTER_HOURS}) / 20.0, 2)),
    sensor_key = 'acceleration_y',
      0.010 * cos((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / 10.0 * 2.0 * pi()),
    sensor_key = 'acceleration_z',
      0.008 * sin((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / 12.0 * 2.0 * pi()),
    sensor_key = 'gyroscope_x',
      0.22 * sin((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / 6.0 * 2.0 * pi())
      + 0.35 * exp(-pow((toFloat64(719 - number) - {EVENT_CENTER_HOURS}) / 18.0, 2)),
    sensor_key = 'gyroscope_y',
      0.18 * cos((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / 7.5 * 2.0 * pi()),
    sensor_key = 'gyroscope_z',
      0.16 * sin((toFloat64(719 - number) + {PHASE_SHIFT_HOURS}) / 9.0 * 2.0 * pi()),
    NULL
  ) AS value_f64,
  NULL AS value_i64,
  NULL AS value_str,
  NULL AS value_bool,
  1 AS quality,
  1 AS schema_version
FROM numbers(720)
ARRAY JOIN [
  'gps_latitude',
  'gps_longitude',
  'gps_altitude',
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

function Seed-ClickhouseDevice(
  [string]$deviceId,
  [double]$latBase,
  [double]$lonBase,
  [double]$latDriftPerHour,
  [double]$lonDriftPerHour,
  [double]$latSeasonalAmplitude,
  [double]$lonSeasonalAmplitude,
  [double]$latEventAmplitude,
  [double]$lonEventAmplitude,
  [double]$altBase,
  [double]$phaseShiftHours,
  [double]$eventCenterHours
) {
  $sql = $chInsertTemplate.Replace("{DEVICE_ID}", $deviceId)
  $sql = $sql.Replace("{LAT_BASE}", [string]$latBase)
  $sql = $sql.Replace("{LON_BASE}", [string]$lonBase)
  $sql = $sql.Replace("{LAT_DRIFT_PER_HOUR}", [string]$latDriftPerHour)
  $sql = $sql.Replace("{LON_DRIFT_PER_HOUR}", [string]$lonDriftPerHour)
  $sql = $sql.Replace("{LAT_SEASONAL_AMPLITUDE}", [string]$latSeasonalAmplitude)
  $sql = $sql.Replace("{LON_SEASONAL_AMPLITUDE}", [string]$lonSeasonalAmplitude)
  $sql = $sql.Replace("{LAT_EVENT_AMPLITUDE}", [string]$latEventAmplitude)
  $sql = $sql.Replace("{LON_EVENT_AMPLITUDE}", [string]$lonEventAmplitude)
  $sql = $sql.Replace("{ALT_BASE}", [string]$altBase)
  $sql = $sql.Replace("{PHASE_SHIFT_HOURS}", [string]$phaseShiftHours)
  $sql = $sql.Replace("{EVENT_CENTER_HOURS}", [string]$eventCenterHours)

  $sql | docker compose -f $ComposeFile --env-file $EnvFile exec -T clickhouse clickhouse-client --user $chUser --password $chPassword --database $chDatabase --multiquery 1>$null
  Assert-LastExitCode "clickhouse-client failed: seed $deviceId"
}

Seed-ClickhouseDevice "30000000-0000-0000-0000-000000000001" 22.684700 108.351600 1.9e-10 1.5e-10 1.4e-8 1.0e-8 1.8e-8 1.4e-8 12.30 0 540
Seed-ClickhouseDevice "30000000-0000-0000-0000-000000000002" 22.684950 108.351900 -2.6e-10 -2.0e-10 0.6e-8 0.5e-8 5.4e-8 4.7e-8 12.40 6 690
Seed-ClickhouseDevice "30000000-0000-0000-0000-000000000003" 22.684450 108.351300 0.1e-10 -0.1e-10 2.6e-8 2.2e-8 0.4e-8 0.3e-8 12.20 14 360

$rainSql = @"
INSERT INTO landslide.telemetry_raw
(received_ts, event_ts, device_id, sensor_key, seq, value_f64, value_i64, value_str, value_bool, quality, schema_version)
SELECT
  toStartOfDay(now64(3, 'UTC')) - toIntervalDay(6 - number) + toIntervalHour(8) AS received_ts,
  NULL AS event_ts,
  '30000000-0000-0000-0000-000000000001' AS device_id,
  'rainfall_mm' AS sensor_key,
  toUInt64(number) AS seq,
  arrayElement([12.0, 8.0, 15.0, 6.0, 9.0, 18.0, 11.0], number + 1) AS value_f64,
  NULL AS value_i64,
  NULL AS value_str,
  NULL AS value_bool,
  1 AS quality,
  1 AS schema_version
FROM numbers(7);
"@

$rainSql | docker compose -f $ComposeFile --env-file $EnvFile exec -T clickhouse clickhouse-client --user $chUser --password $chPassword --database $chDatabase --multiquery 1>$null
Assert-LastExitCode "clickhouse-client failed: seed rainfall demo"

Write-Host "ClickHouse seed done." -ForegroundColor Green
Write-Host "Demo seed complete." -ForegroundColor Green
}
finally {
  if ($seedMutexAcquired) {
    $seedMutex.ReleaseMutex() | Out-Null
  }
  $seedMutex.Dispose()
}
