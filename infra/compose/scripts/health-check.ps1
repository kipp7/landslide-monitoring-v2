param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml",
  [string]$ProjectName = "landslide-monitoring-v2"
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

function Require-Command([string]$cmd) {
  $p = Get-Command $cmd -ErrorAction SilentlyContinue
  if (-not $p) { throw "Missing command: $cmd" }
}

function Check-Image([string]$image) {
  try {
    docker image inspect $image 2>$null 1>$null
  } catch {
    # ignore
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Host "MISSING image: $image" -ForegroundColor Yellow
    return $false
  }
  Write-Host "OK image: $image" -ForegroundColor Green
  return $true
}

function Check-Port([string]$hostName, [int]$port, [string]$name) {
  $r = Test-NetConnection -ComputerName $hostName -Port $port -WarningAction SilentlyContinue
  if ($r.TcpTestSucceeded) {
    Write-Host "OK port: $name (${hostName}:$port)" -ForegroundColor Green
    return $true
  }
  Write-Host "FAIL port: $name (${hostName}:$port)" -ForegroundColor Yellow
  return $false
}

Require-Command "docker"
Require-Command "docker"

Write-Host "== Docker daemon ==" -ForegroundColor Cyan
docker info 1>$null
if ($LASTEXITCODE -ne 0) { throw "Docker daemon is not reachable. Start Docker Desktop and retry." }
Write-Host "OK docker daemon reachable" -ForegroundColor Green

if (-not (Test-Path $EnvFile)) {
  throw "Missing env file: $EnvFile (copy infra/compose/env.example -> infra/compose/.env)"
}
Import-EnvFile $EnvFile

Write-Host "`n== Images ==" -ForegroundColor Cyan
$requiredImages = @(
  "postgres:16-alpine",
  "redis:7-alpine",
  "clickhouse/clickhouse-server:24.10",
  "emqx/emqx:5.7.2",
  "apache/kafka:3.7.0"
)
$optionalImages = @(
  # kafka-ui is only started when using compose profile "ops".
  "provectuslabs/kafka-ui:v0.7.2"
)
$missing = 0
foreach ($img in $requiredImages) {
  if (-not (Check-Image $img)) { $missing++ }
}
if ($missing -gt 0) {
  Write-Host "`nSome images are missing. If Docker Hub is slow/blocked, configure registry mirror in Docker Desktop." -ForegroundColor Yellow
  Write-Host "Then pull images manually or run compose up again." -ForegroundColor Yellow
}

$optionalMissing = 0
foreach ($img in $optionalImages) {
  if (-not (Check-Image $img)) { $optionalMissing++ }
}
if ($optionalMissing -gt 0) {
  Write-Host "`nOptional images are missing (only needed for optional profiles such as kafka-ui)." -ForegroundColor DarkGray
}

Write-Host "`n== Compose status ==" -ForegroundColor Cyan
docker compose -f $ComposeFile --env-file $EnvFile ps

Write-Host "`n== Ports ==" -ForegroundColor Cyan
$ok = $true
$ok = (Check-Port "localhost" 5432 "PostgreSQL") -and $ok
$ok = (Check-Port "localhost" 6379 "Redis") -and $ok
$ok = (Check-Port "localhost" 8123 "ClickHouse HTTP") -and $ok
$ok = (Check-Port "localhost" 9000 "ClickHouse Native") -and $ok
$ok = (Check-Port "localhost" 1883 "MQTT") -and $ok
$ok = (Check-Port "localhost" 18083 "EMQX Dashboard") -and $ok
$ok = (Check-Port "localhost" 9094 "Kafka External") -and $ok

Write-Host "`n== Result ==" -ForegroundColor Cyan
if (-not $ok) {
  Write-Host "Health check finished with warnings. See `docs/guides/testing/troubleshooting-and-evidence.md`." -ForegroundColor Yellow
  exit 1
}

Write-Host "Health check passed." -ForegroundColor Green
