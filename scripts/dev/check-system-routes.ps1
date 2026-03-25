param(
  [int]$Port = 18080,
  [string]$ApiHost = "127.0.0.1",
  [switch]$KeepLogs
)

$ErrorActionPreference = "Stop"

function Read-EnvFile([string]$path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
  foreach ($line in Get-Content -Encoding UTF8 $path) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith("#")) { continue }
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

function Set-EnvVar([hashtable]$snapshot, [string]$name, [string]$value) {
  $snapshot[$name] = [System.Environment]::GetEnvironmentVariable($name, "Process")
  [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
}

function Restore-EnvVars([hashtable]$snapshot) {
  foreach ($key in $snapshot.Keys) {
    [System.Environment]::SetEnvironmentVariable($key, $snapshot[$key], "Process")
  }
}

function Get-EnvValue([hashtable]$map, [string]$key, [string]$fallback) {
  if ($map.ContainsKey($key) -and $null -ne $map[$key] -and [string]$map[$key] -ne "") {
    return [string]$map[$key]
  }
  return $fallback
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$apiDir = Join-Path $repoRoot "services/api"
$apiEnvPath = Join-Path $apiDir ".env"
$apiEnv = Read-EnvFile $apiEnvPath

$stdoutLog = Join-Path $repoRoot "backups/evidence/api-route-check-$Port.stdout.log"
$stderrLog = Join-Path $repoRoot "backups/evidence/api-route-check-$Port.stderr.log"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $stdoutLog) | Out-Null

$envSnapshot = @{}
Set-EnvVar $envSnapshot "SERVICE_NAME" (Get-EnvValue $apiEnv "SERVICE_NAME" "api-service")
Set-EnvVar $envSnapshot "API_HOST" $ApiHost
Set-EnvVar $envSnapshot "API_PORT" ([string]$Port)
Set-EnvVar $envSnapshot "AUTH_REQUIRED" (Get-EnvValue $apiEnv "AUTH_REQUIRED" "false")
Set-EnvVar $envSnapshot "POSTGRES_HOST" (Get-EnvValue $apiEnv "POSTGRES_HOST" "localhost")
Set-EnvVar $envSnapshot "POSTGRES_PORT" (Get-EnvValue $apiEnv "POSTGRES_PORT" "5432")
Set-EnvVar $envSnapshot "POSTGRES_USER" (Get-EnvValue $apiEnv "POSTGRES_USER" "landslide")
Set-EnvVar $envSnapshot "POSTGRES_PASSWORD" (Get-EnvValue $apiEnv "POSTGRES_PASSWORD" "change-me")
Set-EnvVar $envSnapshot "POSTGRES_DATABASE" (Get-EnvValue $apiEnv "POSTGRES_DATABASE" "landslide_monitor")
Set-EnvVar $envSnapshot "CLICKHOUSE_URL" (Get-EnvValue $apiEnv "CLICKHOUSE_URL" "http://localhost:8123")
Set-EnvVar $envSnapshot "CLICKHOUSE_USERNAME" (Get-EnvValue $apiEnv "CLICKHOUSE_USERNAME" "default")
Set-EnvVar $envSnapshot "CLICKHOUSE_PASSWORD" (Get-EnvValue $apiEnv "CLICKHOUSE_PASSWORD" "")
Set-EnvVar $envSnapshot "CLICKHOUSE_DATABASE" (Get-EnvValue $apiEnv "CLICKHOUSE_DATABASE" "landslide")
Set-EnvVar $envSnapshot "CLICKHOUSE_TABLE" (Get-EnvValue $apiEnv "CLICKHOUSE_TABLE" "telemetry_raw")
Set-EnvVar $envSnapshot "ADMIN_API_TOKEN" (Get-EnvValue $apiEnv "ADMIN_API_TOKEN" "")
Set-EnvVar $envSnapshot "KAFKA_BROKERS" (Get-EnvValue $apiEnv "KAFKA_BROKERS" "")

$proc = $null
try {
  $proc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory $apiDir -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

  $baseUrl = "http://$ApiHost`:$Port"
  $ready = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $resp = Invoke-WebRequest -Uri "$baseUrl/health" -UseBasicParsing -TimeoutSec 3
      if ($resp.StatusCode -eq 200) {
        $ready = $true
        break
      }
    } catch {
      # wait until service is ready
    }
  }

  if (-not $ready) {
    throw "api-service did not become healthy on $baseUrl"
  }

  $headers = @{ Authorization = "Bearer smoke-token" }
  $checks = @(
    "/api/v1/dashboard/weekly-trend",
    "/api/v1/system/status",
    "/api/dashboard/summary",
    "/api/dashboard/weekly-trend",
    "/api/system/status"
  )

  foreach ($path in $checks) {
    Write-Host "=== $path ===" -ForegroundColor Cyan
    $content = (Invoke-WebRequest -Uri ($baseUrl + $path) -Headers $headers -UseBasicParsing -TimeoutSec 10).Content
    Write-Host $content
  }
} finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force
  }
  Restore-EnvVars $envSnapshot
  if (-not $KeepLogs) {
    if (Test-Path $stdoutLog) { Remove-Item $stdoutLog -Force }
    if (Test-Path $stderrLog) { Remove-Item $stderrLog -Force }
  }
}
