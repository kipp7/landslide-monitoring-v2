$ErrorActionPreference = "Stop"

param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml",
  [string]$BackupRoot = "backups"
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..\\..")).Path

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

$null = Import-EnvFile $EnvFile

$dataDirValue = $env:DATA_DIR
if (-not $dataDirValue) {
  $dataDirValue = "../../data"
}

# DATA_DIR is relative to infra/compose, resolve to repo root absolute path for copy.
$dataDirAbs = Resolve-Path (Join-Path (Split-Path $ComposeFile -Parent) $dataDirValue)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dst = Join-Path (Join-Path $repoRoot $BackupRoot) $timestamp

New-Item -ItemType Directory -Force -Path $dst | Out-Null

Write-Host "Stopping services (offline backup)..."
docker compose -f $ComposeFile --env-file $EnvFile down

Write-Host "Copying data dir: $dataDirAbs -> $dst"
Copy-Item -Recurse -Force $dataDirAbs (Join-Path $dst "data")

Write-Host "Starting services..."
docker compose -f $ComposeFile --env-file $EnvFile up -d

Write-Host "Backup complete: $dst"
