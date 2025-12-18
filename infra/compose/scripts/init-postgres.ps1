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

$sqlFiles = Get-ChildItem -Path $SqlDir -File -Filter "*.sql" | Sort-Object Name
foreach ($f in $sqlFiles) {
  Write-Host "Running: $($f.Name)"
  $sql = Get-Content -Raw -Encoding UTF8 $f.FullName
  $sql | docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -v ON_ERROR_STOP=1 -U $env:PG_USER -d $env:PG_DATABASE
  Assert-LastExitCode "psql failed: $($f.Name)"
}

Write-Host "PostgreSQL init done."
