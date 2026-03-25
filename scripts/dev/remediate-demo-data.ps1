param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

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
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("demo-remediate-" + [guid]::NewGuid().ToString("N") + ".sql")
  try {
    Set-Content -Path $tmp -Value $sql -Encoding UTF8
    docker compose -f $ComposeFile --env-file $EnvFile cp $tmp postgres:/tmp/demo-remediate.sql 1>$null
    Assert-LastExitCode "docker compose cp failed: $label"
    docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -v ON_ERROR_STOP=1 -U $env:PG_USER -d $env:PG_DATABASE -f /tmp/demo-remediate.sql 1>$null
    Assert-LastExitCode "psql failed: $label"
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
    docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres rm -f /tmp/demo-remediate.sql 1>$null 2>$null
  }
}

Import-EnvFile $EnvFile

$sql = @"
SET client_encoding = 'UTF8';

UPDATE stations
SET station_name = convert_from(decode('e7a4bae4be8be79b91e6b58be782b941', 'hex'), 'UTF8'),
    metadata = jsonb_build_object(
      'note', 'seed demo',
      'locationName', convert_from(decode('e7a4bae4be8be79b91e6b58be58cba41', 'hex'), 'UTF8'),
      'riskLevel', 'medium',
      'risk_level', 'medium'
    ),
    updated_at = NOW()
WHERE station_code = 'DEMO001';

UPDATE devices
SET station_id = (SELECT station_id FROM stations WHERE station_code = 'DEMO001'),
    metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{station_name}', to_jsonb(convert_from(decode('e7a4bae4be8be79b91e6b58be782b941', 'hex'), 'UTF8')::text), true),
    updated_at = NOW()
WHERE COALESCE(metadata->>'note','') = 'smoke_test';

UPDATE devices
SET metadata = jsonb_set(
      jsonb_set(
        jsonb_set(COALESCE(metadata, '{}'::jsonb), '{station_name}', to_jsonb(convert_from(decode('e7a4bae4be8be79b91e6b58be782b941', 'hex'), 'UTF8')::text), true),
        '{location_name}', to_jsonb(convert_from(decode('e7a4bae4be8be79b91e6b58be58cba41', 'hex'), 'UTF8')::text), true
      ),
      '{risk_level}', to_jsonb('medium'::text), true
    ),
    updated_at = NOW()
WHERE device_id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);
"@

Invoke-PostgresSqlText $sql "remediate demo data"

Write-Host "Demo data remediation applied." -ForegroundColor Green
