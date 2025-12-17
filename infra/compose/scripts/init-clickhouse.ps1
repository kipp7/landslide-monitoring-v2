$ErrorActionPreference = "Stop"

param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml",
  [string]$SqlDir = "docs/integrations/storage/clickhouse"
)

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

Write-Host "Applying ClickHouse DDL from $SqlDir"

$null = Import-EnvFile $EnvFile

$sqlFiles = Get-ChildItem -Path $SqlDir -File -Filter "*.sql" | Sort-Object Name
foreach ($f in $sqlFiles) {
  Write-Host "Running: $($f.Name)"
  $sql = Get-Content -Raw -Encoding UTF8 $f.FullName
  $sql | docker compose -f $ComposeFile --env-file $EnvFile exec -T clickhouse clickhouse-client --user $env:CH_USER --password $env:CH_PASSWORD --database $env:CH_DATABASE --multiquery
}

Write-Host "ClickHouse init done."
