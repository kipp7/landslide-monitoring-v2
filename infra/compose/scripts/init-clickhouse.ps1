param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml",
  [string]$SqlDir = "docs/integrations/storage/clickhouse"
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

Write-Host "Applying ClickHouse DDL from $SqlDir"

$null = Import-EnvFile $EnvFile

function Assert-LastExitCode([string]$message) {
  if ($LASTEXITCODE -ne 0) { throw "$message (exit=$LASTEXITCODE)" }
}

Write-Host "Waiting for ClickHouse to respond to /ping..." -ForegroundColor Cyan
$maxWaitSeconds = 90
$start = Get-Date
while ($true) {
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:8123/ping" -TimeoutSec 2
    if ($resp.StatusCode -eq 200 -and $resp.Content -match "Ok") { break }
  } catch {
    # ignore
  }
  if (((Get-Date) - $start).TotalSeconds -gt $maxWaitSeconds) {
    throw "ClickHouse is not ready after ${maxWaitSeconds}s. Check: docker compose logs clickhouse"
  }
  Start-Sleep -Seconds 2
}
Write-Host "ClickHouse is ready." -ForegroundColor Green

$chUser = $env:CH_USER
if (-not $chUser) { $chUser = "landslide" }
$chPassword = $env:CH_PASSWORD
if (-not $chPassword) { $chPassword = "change-me" }
$chDatabase = $env:CH_DATABASE
if (-not $chDatabase) { $chDatabase = "landslide" }

function Get-ClickhouseContainerEnv([string]$var) {
  $cmd = 'printf "%s" "$' + $var + '"'
  $val = docker compose -f $ComposeFile --env-file $EnvFile exec -T clickhouse sh -lc $cmd 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  $t = ($val | Out-String).Trim()
  if (-not $t) { return $null }
  return $t
}

function Invoke-ClickhouseClient([string]$sqlText, [string]$user, [string]$password, [string]$database) {
  try {
    $out = $sqlText | docker compose -f $ComposeFile --env-file $EnvFile exec -T clickhouse clickhouse-client --user $user --password $password --database $database --multiquery 2>&1
    return @{
      Out = ($out | Out-String)
      Code = $LASTEXITCODE
    }
  } catch {
    return @{
      Out = ($_ | Out-String)
      Code = $LASTEXITCODE
    }
  }
}

$sqlFiles = Get-ChildItem -Path $SqlDir -File -Filter "*.sql" | Sort-Object Name
foreach ($f in $sqlFiles) {
  Write-Host "Running: $($f.Name)"
  $sql = Get-Content -Raw -Encoding UTF8 $f.FullName

  $res = Invoke-ClickhouseClient $sql $chUser $chPassword $chDatabase
  $out = $res.Out
  $code = $res.Code

  if ($code -ne 0 -and ($out -match "AUTHENTICATION_FAILED|Authentication failed")) {
    $runtimeUser = Get-ClickhouseContainerEnv "CLICKHOUSE_USER"
    $runtimePassword = Get-ClickhouseContainerEnv "CLICKHOUSE_PASSWORD"
    $runtimeDatabase = Get-ClickhouseContainerEnv "CLICKHOUSE_DB"

    if ($runtimeUser) { $chUser = $runtimeUser }
    if ($runtimePassword) { $chPassword = $runtimePassword }
    if ($runtimeDatabase) { $chDatabase = $runtimeDatabase }

    Write-Host "Retrying ClickHouse DDL using container credentials..." -ForegroundColor Yellow
    $res = Invoke-ClickhouseClient $sql $chUser $chPassword $chDatabase
    $out = $res.Out
    $code = $res.Code
  }

  if ($code -ne 0) {
    throw "clickhouse-client failed: $($f.Name) (exit=$code)`n$out"
  }
}

Write-Host "ClickHouse init done."
