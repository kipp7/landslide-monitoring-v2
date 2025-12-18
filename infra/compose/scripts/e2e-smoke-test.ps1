param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml",
  [string]$DeviceId = "",
  [switch]$SkipBuild,
  [switch]$SkipWriteServiceEnv,
  [switch]$ForceWriteServiceEnv
)

$ErrorActionPreference = "Stop"

function Assert-LastExitCode([string]$message) {
  if ($LASTEXITCODE -ne 0) { throw "$message (exit=$LASTEXITCODE)" }
}

function Read-EnvFile([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing env file: $path" }
  $map = @{}
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

function Write-EnvIfMissingOrForced([string]$path, [string[]]$lines, [switch]$force) {
  if ((Test-Path $path) -and (-not $force)) {
    Write-Host "Keeping existing env: $path" -ForegroundColor DarkGray
    return
  }
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $content = ($lines -join "`n") + "`n"
  Set-Content -Encoding UTF8 -Path $path -Value $content
  Write-Host "Wrote env: $path" -ForegroundColor Green
}

function Read-EnvValue([string]$path, [string]$key, [string]$fallback) {
  if (-not (Test-Path $path)) { return $fallback }
  $lines = Get-Content -Encoding UTF8 $path
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t.StartsWith("#")) { continue }
    if (-not $t.StartsWith("$key=")) { continue }
    return $t.Substring($key.Length + 1).Trim()
  }
  return $fallback
}

if (-not (Test-Path $EnvFile)) {
  throw "Missing env file: $EnvFile (copy infra/compose/env.example -> infra/compose/.env)"
}

$envs = Read-EnvFile $EnvFile

$mqttUrl = if ($envs.ContainsKey("MQTT_URL")) { $envs["MQTT_URL"] } else { "mqtt://localhost:1883" }
$kafkaBrokers = if ($envs.ContainsKey("KAFKA_BROKERS")) { $envs["KAFKA_BROKERS"] } else { "localhost:9094" }
$chUrl = if ($envs.ContainsKey("CH_HTTP_URL")) { $envs["CH_HTTP_URL"] } else { "http://localhost:8123" }
$chUser = if ($envs.ContainsKey("CH_USER")) { $envs["CH_USER"] } else { "default" }
$chPassword = if ($envs.ContainsKey("CH_PASSWORD")) { $envs["CH_PASSWORD"] } else { "" }
$chDb = if ($envs.ContainsKey("CH_DATABASE")) { $envs["CH_DATABASE"] } else { "landslide" }

$pgHost = if ($envs.ContainsKey("PG_HOST")) { $envs["PG_HOST"] } else { "localhost" }
$pgPort = if ($envs.ContainsKey("PG_PORT")) { $envs["PG_PORT"] } else { "5432" }
$pgUser = if ($envs.ContainsKey("PG_USER")) { $envs["PG_USER"] } else { "landslide" }
$pgPassword = if ($envs.ContainsKey("PG_PASSWORD")) { $envs["PG_PASSWORD"] } else { "" }
$pgDb = if ($envs.ContainsKey("PG_DATABASE")) { $envs["PG_DATABASE"] } else { "landslide_monitor" }

if (-not $SkipWriteServiceEnv) {
  Write-Host "Preparing service env files (ignored by git)..." -ForegroundColor Cyan

  Write-EnvIfMissingOrForced "services/ingest/.env" @(
    "SERVICE_NAME=ingest-service",
    "",
    "MQTT_URL=$mqttUrl",
    "MQTT_USERNAME=",
    "MQTT_PASSWORD=",
    "MQTT_TOPIC_TELEMETRY=telemetry/+",
    "",
    "KAFKA_BROKERS=$kafkaBrokers",
    "KAFKA_CLIENT_ID=ingest-service",
    "KAFKA_TOPIC_TELEMETRY_RAW=telemetry.raw.v1",
    "KAFKA_TOPIC_TELEMETRY_DLQ=telemetry.dlq.v1"
  ) -force:$ForceWriteServiceEnv

  Write-EnvIfMissingOrForced "services/telemetry-writer/.env" @(
    "SERVICE_NAME=telemetry-writer",
    "",
    "KAFKA_BROKERS=$kafkaBrokers",
    "KAFKA_CLIENT_ID=telemetry-writer",
    "KAFKA_GROUP_ID=telemetry-writer.v1",
    "KAFKA_TOPIC_TELEMETRY_RAW=telemetry.raw.v1",
    "",
    "CLICKHOUSE_URL=$chUrl",
    "CLICKHOUSE_USERNAME=$chUser",
    "CLICKHOUSE_PASSWORD=$chPassword",
    "CLICKHOUSE_DATABASE=$chDb",
    "CLICKHOUSE_TABLE=telemetry_raw",
    "",
    "BATCH_MAX_ROWS=2000",
    "BATCH_FLUSH_INTERVAL_MS=1000"
  ) -force:$ForceWriteServiceEnv

  Write-EnvIfMissingOrForced "services/api/.env" @(
    "SERVICE_NAME=api-service",
    "API_HOST=0.0.0.0",
    "API_PORT=8080",
    "",
    "AUTH_REQUIRED=false",
    "ADMIN_API_TOKEN=",
    "",
    "POSTGRES_HOST=$pgHost",
    "POSTGRES_PORT=$pgPort",
    "POSTGRES_USER=$pgUser",
    "POSTGRES_PASSWORD=$pgPassword",
    "POSTGRES_DATABASE=$pgDb",
    "POSTGRES_POOL_MAX=10",
    "",
    "CLICKHOUSE_URL=$chUrl",
    "CLICKHOUSE_USERNAME=$chUser",
    "CLICKHOUSE_PASSWORD=$chPassword",
    "CLICKHOUSE_DATABASE=$chDb",
    "CLICKHOUSE_TABLE=telemetry_raw",
    "",
    "API_MAX_SERIES_RANGE_HOURS=168",
    "API_MAX_POINTS=100000"
  ) -force:$ForceWriteServiceEnv
}

if (-not $SkipBuild) {
  Write-Host "Building workspaces..." -ForegroundColor Cyan
  npm run build
  Assert-LastExitCode "npm run build failed"
}

Write-Host "Checking infra is reachable..." -ForegroundColor Cyan
try {
  $resp = Invoke-WebRequest -UseBasicParsing -Uri "$chUrl/ping" -TimeoutSec 3
  if ($resp.StatusCode -ne 200 -or ($resp.Content -notmatch "Ok")) {
    throw "ClickHouse /ping did not return Ok"
  }
} catch {
  throw "ClickHouse not reachable at $chUrl. Did you run: docker compose -f $ComposeFile --env-file $EnvFile up -d ?"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = "backups/evidence/e2e-smoke-$timestamp"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$ingestOut = Join-Path $logDir "ingest.stdout.log"
$ingestErr = Join-Path $logDir "ingest.stderr.log"
$writerOut = Join-Path $logDir "writer.stdout.log"
$writerErr = Join-Path $logDir "writer.stderr.log"
$apiOut = Join-Path $logDir "api.stdout.log"
$apiErr = Join-Path $logDir "api.stderr.log"

$apiEnvPath = "services/api/.env"
$apiPort = Read-EnvValue $apiEnvPath "API_PORT" "8080"

if (-not $DeviceId -or $DeviceId.Trim().Length -eq 0) {
  $DeviceId = (New-Guid).ToString()
}

Write-Host "Using deviceId: $DeviceId" -ForegroundColor Cyan

$ingestProc = $null
$writerProc = $null
$apiProc = $null

try {
  Write-Host "Starting services..." -ForegroundColor Cyan

  $ingestProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/ingest" -PassThru -RedirectStandardOutput $ingestOut -RedirectStandardError $ingestErr
  $writerProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/telemetry-writer" -PassThru -RedirectStandardOutput $writerOut -RedirectStandardError $writerErr
  $apiProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/api" -PassThru -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr

  Write-Host "Waiting for API /health..." -ForegroundColor Cyan
  $maxWaitSeconds = 60
  $start = Get-Date
  while ($true) {
    try {
      $health = Invoke-RestMethod -Uri "http://localhost:$apiPort/health" -TimeoutSec 2
      if ($health.ok -eq $true) { break }
    } catch {
      # ignore
    }
    if (((Get-Date) - $start).TotalSeconds -gt $maxWaitSeconds) {
      throw "API did not become healthy after ${maxWaitSeconds}s. Logs: $logDir"
    }
    Start-Sleep -Seconds 2
  }
  Write-Host "API is healthy." -ForegroundColor Green

  Write-Host "Publishing telemetry to MQTT..." -ForegroundColor Cyan
  node scripts/dev/publish-telemetry.js --mqtt $mqttUrl --device $DeviceId
  Assert-LastExitCode "publish-telemetry.js failed"

  Write-Host "Querying latest state..." -ForegroundColor Cyan
  $stateUrl = "http://localhost:$apiPort/api/v1/data/state/$DeviceId"
  $deadline = (Get-Date).AddSeconds(45)
  $state = $null
  while ((Get-Date) -lt $deadline) {
    try {
      $state = Invoke-RestMethod -Uri $stateUrl -TimeoutSec 3
      if ($state.success -eq $true) { break }
    } catch {
      # ignore
    }
    Start-Sleep -Seconds 2
  }
  if (-not $state -or $state.success -ne $true) {
    throw "state query failed or timed out. Logs: $logDir"
  }

  $metrics = $state.data.state.metrics
  foreach ($k in @("displacement_mm", "tilt_x_deg", "battery_v")) {
    if (-not $metrics.PSObject.Properties.Name -contains $k) {
      throw "Missing metric '$k' in state response. Logs: $logDir"
    }
  }

  Write-Host "Querying series..." -ForegroundColor Cyan
  $startTime = (Get-Date).AddHours(-1).ToUniversalTime().ToString("o")
  $endTime = (Get-Date).AddHours(1).ToUniversalTime().ToString("o")
  $seriesUrl = "http://localhost:$apiPort/api/v1/data/series/$DeviceId?startTime=$startTime&endTime=$endTime&sensorKeys=displacement_mm"
  $series = Invoke-RestMethod -Uri $seriesUrl -TimeoutSec 10
  if ($series.success -ne $true) { throw "series query failed. Logs: $logDir" }
  if (-not $series.data.series -or $series.data.series.Count -lt 1) {
    throw "series response has no data. Logs: $logDir"
  }
  if (-not $series.data.series[0].points -or $series.data.series[0].points.Count -lt 1) {
    throw "series response has no points. Logs: $logDir"
  }

  Write-Host "E2E smoke test passed." -ForegroundColor Green
  Write-Host "Logs: $logDir" -ForegroundColor DarkGray
} finally {
  Write-Host "Stopping services..." -ForegroundColor Cyan
  foreach ($p in @($ingestProc, $writerProc, $apiProc)) {
    if ($null -eq $p) { continue }
    try {
      if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
    } catch {
      # ignore
    }
  }
}

