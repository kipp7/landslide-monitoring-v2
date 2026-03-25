$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$composeFile = Join-Path $repoRoot "infra/compose/docker-compose.yml"
$envFile = Join-Path $repoRoot "infra/compose/.env"
$tsFile = Join-Path $repoRoot "scripts/dev/check-desk-pagination-proof.ts"

function Invoke-PostgresSql([string]$sql, [string]$label) {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("desk-pagination-" + [guid]::NewGuid().ToString("N") + ".sql")
  try {
    Set-Content -Path $tmp -Value $sql -Encoding UTF8
    docker compose -f $composeFile --env-file $envFile cp $tmp postgres:/tmp/desk-pagination.sql 1>$null
    if ($LASTEXITCODE -ne 0) { throw "docker compose cp failed: $label" }
    docker compose -f $composeFile --env-file $envFile exec -T postgres psql -v ON_ERROR_STOP=1 -U landslide -d landslide_monitor -f /tmp/desk-pagination.sql 1>$null
    if ($LASTEXITCODE -ne 0) { throw "psql failed: $label" }
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
    docker compose -f $composeFile --env-file $envFile exec -T postgres rm -f /tmp/desk-pagination.sql 1>$null 2>$null
  }
}

$cleanupSql = @'
DELETE FROM gps_baselines
WHERE device_id IN (
  SELECT device_id
  FROM devices
  WHERE COALESCE(metadata->>'note','') = 'pagination_smoke'
);

DELETE FROM devices
WHERE COALESCE(metadata->>'note','') = 'pagination_smoke';
'@

$seedSql = @'
WITH target_station AS (
  SELECT station_id
  FROM stations
  WHERE station_code = 'DEMO002'
  LIMIT 1
),
inserted AS (
  INSERT INTO devices (
    device_id,
    device_name,
    device_type,
    station_id,
    status,
    device_secret_hash,
    metadata,
    last_seen_at
  )
  SELECT
    gen_random_uuid(),
    'pagination_smoke_' || LPAD(gs::text, 3, '0'),
    'multi_sensor',
    (SELECT station_id FROM target_station),
    'active',
    'dev-seed',
    jsonb_build_object(
      'note', 'pagination_smoke',
      'legacy_device_id', 'pagination_smoke_' || LPAD(gs::text, 3, '0'),
      'station_name', '示例监测点B',
      'location_name', '示例监测区B',
      'risk_level', 'low',
      'sensor_types', to_jsonb(ARRAY['gnss'])
    ),
    NOW()
  FROM generate_series(1, 205) AS gs
  RETURNING device_id
)
INSERT INTO gps_baselines (device_id, method, points_count, baseline, computed_at, updated_at)
SELECT
  device_id,
  'manual',
  60,
  jsonb_build_object(
    'latitude', 22.689200,
    'longitude', 108.357900,
    'altitude', 12.0,
    'positionAccuracyMeters', 1.5,
    'satelliteCount', 10,
    'establishedBy', 'pagination_smoke',
    'notes', 'pagination_smoke'
  ),
  NOW(),
  NOW()
FROM inserted;
'@

try {
  Invoke-PostgresSql $cleanupSql "cleanup previous pagination smoke"
  Invoke-PostgresSql $seedSql "seed pagination smoke"
  & (Join-Path $repoRoot "scripts/dev/invoke-tsx.ps1") $tsFile
  if ($LASTEXITCODE -ne 0) {
    throw "desk pagination proof failed (exit=$LASTEXITCODE)"
  }
} finally {
  Invoke-PostgresSql $cleanupSql "cleanup pagination smoke"
}

