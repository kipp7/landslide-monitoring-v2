param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml",
  [string]$SqlDir = "docs/integrations/storage/postgres/tables"
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

if (-not (Test-Path $EnvFile)) {
  throw "Missing env file: $EnvFile (copy infra/compose/env.example -> infra/compose/.env)"
}

if (-not (Test-Path $SqlDir)) {
  throw "Missing SQL dir: $SqlDir"
}

Write-Host "Applying PostgreSQL DDL from $SqlDir"

$null = Import-EnvFile $EnvFile

function Assert-LastExitCode([string]$message) {
  if ($LASTEXITCODE -ne 0) { throw "$message (exit=$LASTEXITCODE)" }
}

Write-Host "Waiting for PostgreSQL to accept connections..." -ForegroundColor Cyan
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

$migrationsTableSql = @"
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"@

$migrationsTableSql | docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -v ON_ERROR_STOP=1 -U $env:PG_USER -d $env:PG_DATABASE 1>$null
Assert-LastExitCode "psql failed: create schema_migrations"

$applied = docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -U $env:PG_USER -d $env:PG_DATABASE -At -c "SELECT filename FROM schema_migrations ORDER BY filename;"
Assert-LastExitCode "psql failed: read schema_migrations"
$appliedSet = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($line in ($applied -split "`r?`n")) {
  $t = $line.Trim()
  if ($t.Length -gt 0) { $null = $appliedSet.Add($t) }
}

$sqlFiles = Get-ChildItem -Path $SqlDir -File -Filter "*.sql" | Sort-Object Name

# Bootstrap mode:
# If schema already exists (e.g. tables were created before we introduced schema_migrations),
# we backfill schema_migrations and do NOT re-run DDL (to avoid "relation already exists" failures).
if ($appliedSet.Count -eq 0) {
  $hasExistingSchema = docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -U $env:PG_USER -d $env:PG_DATABASE -At -c "SELECT (to_regclass('public.users') IS NOT NULL) OR (to_regclass('public.devices') IS NOT NULL);"
  Assert-LastExitCode "psql failed: detect existing schema"
  if ($hasExistingSchema.Trim().ToLowerInvariant() -eq "t") {
    Write-Host "Detected existing schema without migration records; backfilling schema_migrations (bootstrap mode)." -ForegroundColor Yellow
    foreach ($f in $sqlFiles) {
      docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -v ON_ERROR_STOP=1 -U $env:PG_USER -d $env:PG_DATABASE -c "INSERT INTO schema_migrations(filename) VALUES ('$($f.Name)') ON CONFLICT DO NOTHING;" 1>$null
      Assert-LastExitCode "psql failed: bootstrap record migration $($f.Name)"
    }
    Write-Host "Bootstrap complete. PostgreSQL init done." -ForegroundColor Green
    exit 0
  }
}

foreach ($f in $sqlFiles) {
  if ($appliedSet.Contains($f.Name)) {
    Write-Host "Skipping (already applied): $($f.Name)"
    continue
  }

  Write-Host "Running: $($f.Name)"
  $sql = Get-Content -Raw -Encoding UTF8 $f.FullName

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $out = $sql | docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -v ON_ERROR_STOP=1 -U $env:PG_USER -d $env:PG_DATABASE 2>&1 | Out-String
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $prevEap

  if ($exitCode -ne 0) {
    # Backward compatible: if schema was initialized before we introduced schema_migrations,
    # baseline DDL may fail with "already exists". Treat it as applied and continue.
    if ($out -match "already exists") {
      Write-Host "WARN: DDL seems already applied (detected 'already exists'), marking as applied: $($f.Name)" -ForegroundColor Yellow
    } else {
      throw ("psql failed: " + $f.Name + "`n" + $out)
    }
  }

  docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -v ON_ERROR_STOP=1 -U $env:PG_USER -d $env:PG_DATABASE -c "INSERT INTO schema_migrations(filename) VALUES ('$($f.Name)') ON CONFLICT DO NOTHING;" 1>$null
  Assert-LastExitCode "psql failed: record migration $($f.Name)"
}

Write-Host "PostgreSQL init done."
