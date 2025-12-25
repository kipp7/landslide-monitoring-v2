$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml"
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

if (-not (Test-Path $EnvFile)) {
  throw "Missing env file: $EnvFile (copy infra/compose/env.example -> infra/compose/.env)"
}

$null = Import-EnvFile $EnvFile

$dataDirValue = $env:DATA_DIR
if (-not $dataDirValue) { $dataDirValue = "../../data" }

# DATA_DIR is relative to infra/compose. Build an absolute path even if the dir doesn't exist yet.
$composeDirAbs = (Resolve-Path -Path (Split-Path $ComposeFile -Parent)).Path
$dataDirAbs = [System.IO.Path]::GetFullPath((Join-Path $composeDirAbs $dataDirValue))

$backupAbs = Resolve-Path -Path $BackupPath
$backupDataDir = $backupAbs
if ((Test-Path (Join-Path $backupAbs "data")) -and (Test-Path -Path (Join-Path $backupAbs "data") -PathType Container)) {
  $backupDataDir = Resolve-Path (Join-Path $backupAbs "data")
}

if (-not (Test-Path $backupDataDir -PathType Container)) {
  throw "Backup data directory not found: $backupDataDir"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$preRestore = (Join-Path $repoRoot "backups") | Join-Path -ChildPath ("pre-restore-" + $timestamp)
New-Item -ItemType Directory -Force -Path $preRestore | Out-Null

Write-Host "Stopping services (offline restore)..." -ForegroundColor Cyan
docker compose -f $ComposeFile --env-file $EnvFile down

if (Test-Path $dataDirAbs) {
  $dst = Join-Path $preRestore "data"
  Write-Host "Saving current data dir to: $dst" -ForegroundColor DarkGray
  Copy-Item -Recurse -Force $dataDirAbs $dst
}

Write-Host "Restoring: $backupDataDir -> $dataDirAbs" -ForegroundColor Cyan
if (Test-Path $dataDirAbs) {
  Remove-Item -Recurse -Force $dataDirAbs
}
Copy-Item -Recurse -Force $backupDataDir $dataDirAbs

Write-Host "Starting services..." -ForegroundColor Cyan
docker compose -f $ComposeFile --env-file $EnvFile up -d

Write-Host "Restore complete." -ForegroundColor Green
Write-Host "Saved pre-restore snapshot: $preRestore" -ForegroundColor DarkGray
