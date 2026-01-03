param(
  [int]$ApiPort = 8080,
  [int]$WebPort = 3000,
  [string]$ApiBaseUrl = "http://localhost:8080",
  [switch]$ForceKillPorts,
  [switch]$SkipInstall,
  [switch]$SkipDocker,
  [switch]$SkipInit,
  [switch]$SkipSeed,
  [switch]$SkipBuild,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot() {
  $here = Get-Location
  $dir = $here.Path
  while ($dir -and -not (Test-Path (Join-Path $dir "package.json"))) {
    $parent = Split-Path -Parent $dir
    if ($parent -eq $dir) { break }
    $dir = $parent
  }
  if (-not $dir -or -not (Test-Path (Join-Path $dir "package.json"))) {
    throw "Cannot find repo root (package.json). Run this script from inside the repo."
  }
  return $dir
}

function Assert-Cmd([string]$name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "Missing required command: $name" }
}

function Assert-LastExitCode([string]$message) {
  if ($LASTEXITCODE -ne 0) { throw "$message (exit=$LASTEXITCODE)" }
}

function Assert-DockerReady() {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $null = docker version 1>$null 2>$null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prevEap

  if ($code -ne 0) {
    throw @"
Docker engine is not reachable.

Fix options:
- Start Docker Desktop (and wait until it says 'Running'), then re-run this script.
- If your org requires it, run PowerShell as Administrator.
- Or run: scripts/dev/start-local.ps1 -SkipDocker (if you already run Postgres/ClickHouse elsewhere).
"@
  }
}

function Set-OrAppendEnvValue([string]$path, [string]$key, [string]$value) {
  $lines = @()
  if (Test-Path $path) { $lines = Get-Content -Encoding UTF8 $path }

  $found = $false
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($line in $lines) {
    if ($line -match "^\s*$key=") {
      $out.Add("$key=$value")
      $found = $true
    } else {
      $out.Add($line)
    }
  }
  if (-not $found) {
    if ($out.Count -gt 0 -and $out[$out.Count - 1].Trim().Length -ne 0) { $out.Add("") }
    $out.Add("$key=$value")
  }
  Set-Content -Encoding UTF8 -Path $path -Value ($out -join "`n")
}

function Read-EnvFile([string]$path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
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
    $map[$key] = $val
  }
  return $map
}

function Resolve-HttpUrlFromTemplate([string]$raw, [string]$hostName, [string]$portNumber) {
  if ($raw -and -not $raw.Contains('${')) { return $raw }
  if (-not $hostName -or -not $portNumber) { return $raw }
  return ("http://{0}:{1}" -f $hostName.Trim(), $portNumber.Trim())
}

function Stop-ListeningPort([int]$port, [switch]$force) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) {
    Write-Host "Port $port is free." -ForegroundColor DarkGray
    return
  }

  $processIds = $conns | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique
  foreach ($processId in $processIds) {
    if (-not $processId -or $processId -le 0) { continue }
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.ProcessName } else { "PID $processId" }

    if (-not $force) {
      $ans = Read-Host "Port $port is in use by $name (PID $processId). Stop it? [y/N]"
      if ($ans.Trim().ToLowerInvariant() -notin @("y", "yes")) {
        throw "Port $port is busy (PID $processId). Aborted."
      }
    }

    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "Stopped $name (PID $processId) on port $port." -ForegroundColor Yellow
    } catch {
      throw ("Failed to stop PID {0} for port {1}: {2}" -f $processId, $port, $_.Exception.Message)
    }
  }
}

$repoRoot = Resolve-RepoRoot
Set-Location $repoRoot

Assert-Cmd "npm"
if (-not $SkipDocker) { Assert-Cmd "docker" }

Write-Host "=== landslide-monitoring-v2 local start ===" -ForegroundColor Cyan
Write-Host "Repo: $repoRoot" -ForegroundColor DarkGray
Write-Host ""

# First-time bootstrap: install deps if missing.
if (-not $SkipInstall) {
  $nm = Join-Path $repoRoot "node_modules"
  if (-not (Test-Path $nm)) {
    Write-Host "Installing npm dependencies (first run)..." -ForegroundColor Cyan
    npm install
    Assert-LastExitCode "npm install failed"
    Write-Host "npm install done." -ForegroundColor Green
    Write-Host ""
  }
}

# Workaround: if `apps/web/node_modules/next` exists but is incomplete (no package.json),
# Next build/dev can fail with "Can't resolve '../shared/lib/utils'". Remove it so Node resolves hoisted root `node_modules/next`.
$brokenNextDir = Join-Path $repoRoot "apps/web/node_modules/next"
$brokenNextPkg = Join-Path $brokenNextDir "package.json"
if ((Test-Path $brokenNextDir) -and (-not (Test-Path $brokenNextPkg))) {
  try {
    Remove-Item -Recurse -Force $brokenNextDir
    Write-Host "Removed broken apps/web/node_modules/next (will use hoisted root next)." -ForegroundColor Yellow
  } catch {
    Write-Host "WARN: failed to remove broken apps/web/node_modules/next: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Write-Host "[1/5] Clearing ports..." -ForegroundColor Cyan
Stop-ListeningPort -port $ApiPort -force:$ForceKillPorts
Stop-ListeningPort -port $WebPort -force:$ForceKillPorts
Write-Host ""

if (-not $SkipDocker) {
  Assert-DockerReady
  Write-Host "[2/5] Starting Postgres + ClickHouse (Docker Compose)..." -ForegroundColor Cyan
  if (-not (Test-Path "infra/compose/.env")) {
    Copy-Item -Force "infra/compose/env.example" "infra/compose/.env"
    Write-Host "Created infra/compose/.env from env.example" -ForegroundColor Yellow
  }

  docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d postgres clickhouse | Out-Null
  Assert-LastExitCode "docker compose up failed"
  Write-Host "Docker services started." -ForegroundColor Green

  if (-not $SkipInit) {
    Write-Host "Initializing DB schema..." -ForegroundColor Cyan
    & "$repoRoot/infra/compose/scripts/init-postgres.ps1"
    & "$repoRoot/infra/compose/scripts/init-clickhouse.ps1"
    Write-Host "DB schema init done." -ForegroundColor Green
  }

  if (-not $SkipSeed) {
    Write-Host "Seeding demo data..." -ForegroundColor Cyan
    & "$repoRoot/infra/compose/scripts/seed-demo.ps1"
  }
  Write-Host ""
} else {
  Write-Host "[2/5] Skipping Docker (requested)." -ForegroundColor Yellow
  Write-Host ""
}

Write-Host "[3/5] Writing web env (NEXT_PUBLIC_API_BASE_URL)..." -ForegroundColor Cyan
& "$repoRoot/infra/compose/scripts/configure-web-dev-env.ps1" -ApiBaseUrl $ApiBaseUrl -Force
if (-not (Test-Path "$repoRoot/apps/web/.env.local")) { Set-Content -Encoding UTF8 -Path "$repoRoot/apps/web/.env.local" -Value "" }
# For local dev: api-service accepts any non-empty Bearer when JWT isn't configured yet.
Set-OrAppendEnvValue "$repoRoot/apps/web/.env.local" "NEXT_PUBLIC_API_BEARER_TOKEN" "dev"
Write-Host ""

Write-Host "[4/5] Ensuring api-service env..." -ForegroundColor Cyan
if (-not (Test-Path "services/api/.env")) {
  Copy-Item -Force "services/api/.env.example" "services/api/.env"
  Write-Host "Created services/api/.env from .env.example" -ForegroundColor Yellow
}

# If infra/compose/.env exists, sync DB credentials so api-service can connect to compose Postgres/ClickHouse.
$infraEnv = Read-EnvFile "$repoRoot/infra/compose/.env"
if ($infraEnv.Count -gt 0) {
  if ($infraEnv.ContainsKey("PG_USER")) { Set-OrAppendEnvValue "$repoRoot/services/api/.env" "POSTGRES_USER" ([string]$infraEnv["PG_USER"]) }
  if ($infraEnv.ContainsKey("PG_PASSWORD")) { Set-OrAppendEnvValue "$repoRoot/services/api/.env" "POSTGRES_PASSWORD" ([string]$infraEnv["PG_PASSWORD"]) }
  if ($infraEnv.ContainsKey("PG_DATABASE")) { Set-OrAppendEnvValue "$repoRoot/services/api/.env" "POSTGRES_DATABASE" ([string]$infraEnv["PG_DATABASE"]) }
  if ($infraEnv.ContainsKey("PG_HOST")) { Set-OrAppendEnvValue "$repoRoot/services/api/.env" "POSTGRES_HOST" ([string]$infraEnv["PG_HOST"]) }
  if ($infraEnv.ContainsKey("PG_PORT")) { Set-OrAppendEnvValue "$repoRoot/services/api/.env" "POSTGRES_PORT" ([string]$infraEnv["PG_PORT"]) }

  $chHost = if ($infraEnv.ContainsKey("CH_HOST")) { [string]$infraEnv["CH_HOST"] } else { "" }
  $chPort = if ($infraEnv.ContainsKey("CH_HTTP_PORT")) { [string]$infraEnv["CH_HTTP_PORT"] } else { "" }
  $chHttpUrlRaw = if ($infraEnv.ContainsKey("CH_HTTP_URL")) { [string]$infraEnv["CH_HTTP_URL"] } else { "" }
  $chHttpUrl = Resolve-HttpUrlFromTemplate $chHttpUrlRaw $chHost $chPort
  if ($chHttpUrl) { Set-OrAppendEnvValue "$repoRoot/services/api/.env" "CLICKHOUSE_URL" $chHttpUrl }
  if ($infraEnv.ContainsKey("CH_USER")) { Set-OrAppendEnvValue "$repoRoot/services/api/.env" "CLICKHOUSE_USERNAME" ([string]$infraEnv["CH_USER"]) }
  if ($infraEnv.ContainsKey("CH_PASSWORD")) { Set-OrAppendEnvValue "$repoRoot/services/api/.env" "CLICKHOUSE_PASSWORD" ([string]$infraEnv["CH_PASSWORD"]) }
  if ($infraEnv.ContainsKey("CH_DATABASE")) { Set-OrAppendEnvValue "$repoRoot/services/api/.env" "CLICKHOUSE_DATABASE" ([string]$infraEnv["CH_DATABASE"]) }
}
Write-Host ""

Write-Host "[5/5] Starting API + Web (separate windows)..." -ForegroundColor Cyan

$apiCmd = @"
cd '$repoRoot'
`$env:API_PORT='$ApiPort'
npm -w services/api run build
npm -w services/api run start
"@
$webCmd = @"
cd '$repoRoot/apps/web'
`$env:NODE_OPTIONS='--max-old-space-size=8192'
`$env:NEXT_DISABLE_TURBOPACK='1'
`$env:NEXT_PUBLIC_API_BASE_URL='$ApiBaseUrl'
`$env:NEXT_PUBLIC_API_BEARER_TOKEN='dev'
`$env:NEXT_DIST_DIR='.next_v2_dev'
node '$repoRoot/node_modules/next/dist/bin/next' dev --port $WebPort
"@

if ($SkipBuild) {
  $apiCmd = @"
cd '$repoRoot'
`$env:API_PORT='$ApiPort'
npm -w services/api run start
"@
}

Start-Process -FilePath "powershell" -ArgumentList "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", $apiCmd | Out-Null
Start-Process -FilePath "powershell" -ArgumentList "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", $webCmd | Out-Null

Write-Host "API: http://localhost:$ApiPort" -ForegroundColor Green
Write-Host "Web: http://localhost:$WebPort" -ForegroundColor Green
Write-Host ""

if (-not $NoBrowser) {
  Start-Process "http://localhost:$WebPort/analysis" | Out-Null
}
