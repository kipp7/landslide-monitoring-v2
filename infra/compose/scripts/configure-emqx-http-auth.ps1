param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeEmqxContainerName = "lsmv2_emqx",
  [string]$EmqxDashboardHost = "http://localhost:18083",
  [string]$ApiBaseUrl = "http://host.docker.internal:8080",
  [string]$ApiEnvFile = "services/api/.env",
  [string]$IngestEnvFile = "services/ingest/.env",
  [switch]$WriteServiceEnv,
  [switch]$WriteIngestEnv
)

$ErrorActionPreference = "Stop"

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

function Resolve-EnvTemplate([string]$value, [hashtable]$envMap) {
  $out = $value
  $maxPasses = 10
  for ($i = 0; $i -lt $maxPasses; $i++) {
    $before = $out
    $out = [regex]::Replace($out, "\$\{([A-Za-z_][A-Za-z0-9_]*)\}", {
      param($m)
      $k = $m.Groups[1].Value
      if ($envMap.ContainsKey($k) -and $envMap[$k]) { return [string]$envMap[$k] }
      $fromEnv = [System.Environment]::GetEnvironmentVariable($k)
      if ($fromEnv) { return $fromEnv }
      return $m.Value
    })
    if ($out -eq $before) { break }
  }
  return $out
}

function Get-OrCreateToken([string]$path, [string]$key) {
  if (Test-Path $path) {
    $lines = Get-Content -Encoding UTF8 $path
    foreach ($line in $lines) {
      $t = $line.Trim()
      if ($t.StartsWith("#")) { continue }
      if ($t.StartsWith("$key=")) {
        $v = ($t.Substring($key.Length + 1)).Trim()
        if ($v.Length -gt 0) { return $v }
      }
    }
  }

  $token = -join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })

  if (-not (Test-Path $path)) {
    $dir = Split-Path -Parent $path
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    Set-Content -Encoding UTF8 -Path $path -Value ""
  }

  Set-OrAppendEnvValue $path $key $token
  return $token
}

function Ensure-FileFromExample([string]$path, [string]$examplePath) {
  if (Test-Path $path) { return }
  if (-not (Test-Path $examplePath)) { throw "Missing env example: $examplePath" }
  Copy-Item -Force $examplePath $path
}

function Set-OrAppendEnvValue([string]$path, [string]$key, [string]$value) {
  if (-not (Test-Path $path)) { throw "Missing env file: $path" }
  $lines = Get-Content -Encoding UTF8 $path
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
    $out.Add("")
    $out.Add("$key=$value")
  }
  Set-Content -Encoding UTF8 -Path $path -Value ($out -join "`n")
}

function New-BearerHeaders([string]$token) {
  return @{ Authorization = "Bearer $token" }
}

function Emqx-Login([string]$baseUrl, [string]$username, [string]$password) {
  $body = @{ username = $username; password = $password } | ConvertTo-Json
  $resp = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/v5/login" -ContentType "application/json" -Body $body -TimeoutSec 15
  if (-not $resp.token) { throw "Failed to login to EMQX dashboard API." }
  return [string]$resp.token
}

function Emqx-Api([string]$method, [string]$baseUrl, [hashtable]$headers, [string]$path, [object]$body = $null) {
  $uri = "$baseUrl$path"
  if ($null -eq $body) {
    return Invoke-RestMethod -Method $method -Uri $uri -Headers $headers -TimeoutSec 20
  }
  $json = $body | ConvertTo-Json -Depth 20
  return Invoke-RestMethod -Method $method -Uri $uri -Headers $headers -ContentType "application/json" -Body $json -TimeoutSec 20
}

function Ensure-EmqxAdminPassword([string]$container, [string]$password) {
  docker exec $container emqx ctl admins passwd admin $password | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to set EMQX dashboard admin password via docker exec." }
}

if (-not (Test-Path $EnvFile)) {
  throw "Missing env file: $EnvFile (copy infra/compose/env.example -> infra/compose/.env)"
}

$infra = Read-EnvFile $EnvFile
$dashboardUser = if ($infra.ContainsKey("EMQX_DASHBOARD_USER")) { $infra["EMQX_DASHBOARD_USER"] } else { "admin" }
$dashboardPassword = if ($infra.ContainsKey("EMQX_DASHBOARD_PASSWORD")) { $infra["EMQX_DASHBOARD_PASSWORD"] } else { "" }
if (-not $dashboardPassword) { throw "EMQX_DASHBOARD_PASSWORD is required in $EnvFile" }

if ($WriteServiceEnv) {
  Write-Host "Ensuring api-service env contains EMQX webhook token and internal MQTT password..." -ForegroundColor Cyan
  Ensure-FileFromExample $ApiEnvFile "services/api/.env.example"
  Set-OrAppendEnvValue $ApiEnvFile "AUTH_REQUIRED" "false"
  Set-OrAppendEnvValue $ApiEnvFile "ADMIN_API_TOKEN" ""

  if ($infra.ContainsKey("PG_HOST")) { Set-OrAppendEnvValue $ApiEnvFile "POSTGRES_HOST" $infra["PG_HOST"] }
  if ($infra.ContainsKey("PG_PORT")) { Set-OrAppendEnvValue $ApiEnvFile "POSTGRES_PORT" $infra["PG_PORT"] }
  if ($infra.ContainsKey("PG_USER")) { Set-OrAppendEnvValue $ApiEnvFile "POSTGRES_USER" $infra["PG_USER"] }
  if ($infra.ContainsKey("PG_PASSWORD")) { Set-OrAppendEnvValue $ApiEnvFile "POSTGRES_PASSWORD" $infra["PG_PASSWORD"] }
  if ($infra.ContainsKey("PG_DATABASE")) { Set-OrAppendEnvValue $ApiEnvFile "POSTGRES_DATABASE" $infra["PG_DATABASE"] }

  if ($infra.ContainsKey("CH_HTTP_URL")) { Set-OrAppendEnvValue $ApiEnvFile "CLICKHOUSE_URL" (Resolve-EnvTemplate $infra["CH_HTTP_URL"] $infra) }
  if ($infra.ContainsKey("CH_DATABASE")) { Set-OrAppendEnvValue $ApiEnvFile "CLICKHOUSE_DATABASE" $infra["CH_DATABASE"] }
  if ($infra.ContainsKey("CH_USER")) { Set-OrAppendEnvValue $ApiEnvFile "CLICKHOUSE_USERNAME" $infra["CH_USER"] }
  if ($infra.ContainsKey("CH_PASSWORD")) { Set-OrAppendEnvValue $ApiEnvFile "CLICKHOUSE_PASSWORD" $infra["CH_PASSWORD"] }

  $token = Get-OrCreateToken $ApiEnvFile "EMQX_WEBHOOK_TOKEN"
  $internalPass = Get-OrCreateToken $ApiEnvFile "MQTT_INTERNAL_PASSWORD"
  Set-OrAppendEnvValue $ApiEnvFile "MQTT_INTERNAL_USERNAME" "ingest-service"
} else {
  if (-not (Test-Path $ApiEnvFile)) {
    throw "Missing api env file: $ApiEnvFile. Create it (e.g. copy from .env.example) or rerun with -WriteServiceEnv."
  }
  $token = Get-OrCreateToken $ApiEnvFile "EMQX_WEBHOOK_TOKEN"
  $internalPass = Get-OrCreateToken $ApiEnvFile "MQTT_INTERNAL_PASSWORD"
}

if ($WriteIngestEnv) {
  Ensure-FileFromExample $IngestEnvFile "services/ingest/.env.example"
  Write-Host "Updating ingest-service env to use internal MQTT credentials..." -ForegroundColor Cyan
  Set-OrAppendEnvValue $IngestEnvFile "MQTT_USERNAME" "ingest-service"
  Set-OrAppendEnvValue $IngestEnvFile "MQTT_PASSWORD" $internalPass
  if ($infra.ContainsKey("MQTT_URL")) { Set-OrAppendEnvValue $IngestEnvFile "MQTT_URL" (Resolve-EnvTemplate $infra["MQTT_URL"] $infra) }
  if ($infra.ContainsKey("KAFKA_BROKERS")) { Set-OrAppendEnvValue $IngestEnvFile "KAFKA_BROKERS" $infra["KAFKA_BROKERS"] }
}

Write-Host "Resetting EMQX dashboard admin password to match $EnvFile..." -ForegroundColor Cyan
Ensure-EmqxAdminPassword $ComposeEmqxContainerName $dashboardPassword

Write-Host "Logging in to EMQX dashboard API..." -ForegroundColor Cyan
$jwt = Emqx-Login $EmqxDashboardHost $dashboardUser $dashboardPassword
$headers = New-BearerHeaders $jwt

Write-Host "Configuring EMQX HTTP authentication (authn)..." -ForegroundColor Cyan
$authnBody = @{
  mechanism = "password_based"
  backend = "http"
  enable = $true
  method = "post"
  url = "$ApiBaseUrl/emqx/authn"
  headers = @{ "x-emqx-token" = $token }
  body = @{
    username = '${username}'
    password = '${password}'
    clientid = '${clientid}'
  }
}

try {
  $null = Emqx-Api "PUT" $EmqxDashboardHost $headers "/api/v5/authentication/password_based:http" $authnBody
} catch {
  $null = Emqx-Api "POST" $EmqxDashboardHost $headers "/api/v5/authentication" $authnBody
}

Write-Host "Configuring EMQX HTTP authorization (authz)..." -ForegroundColor Cyan
$authzHttpBody = @{
  type = "http"
  enable = $true
  method = "post"
  url = "$ApiBaseUrl/emqx/acl"
  headers = @{ "x-emqx-token" = $token }
  body = @{
    username = '${username}'
    topic = '${topic}'
    action = '${action}'
  }
}

$sources = Emqx-Api "GET" $EmqxDashboardHost $headers "/api/v5/authorization/sources"
$hasHttp = $false
foreach ($s in ($sources.sources | ForEach-Object { $_ })) {
  if ($s.type -eq "http") { $hasHttp = $true }
}
try {
  $null = Emqx-Api "PUT" $EmqxDashboardHost $headers "/api/v5/authorization/sources/http" $authzHttpBody
} catch {
  $null = Emqx-Api "POST" $EmqxDashboardHost $headers "/api/v5/authorization/sources" $authzHttpBody
}

# Tighten default file rules: keep only $SYS access, deny all others.
$fileRules = @'
{allow, {username, {re, "^dashboard$"}}, subscribe, ["$SYS/#"]}.
{allow, {ipaddr, "127.0.0.1"}, all, ["$SYS/#"]}.
{deny, all}.
'@
$null = Emqx-Api "PUT" $EmqxDashboardHost $headers "/api/v5/authorization/sources/file" @{
  type = "file"
  enable = $true
  rules = $fileRules
}

# Ensure no_match is deny (defense-in-depth; effective when a source cannot determine result).
$settings = Emqx-Api "GET" $EmqxDashboardHost $headers "/api/v5/authorization/settings"
$settings.no_match = "deny"
$null = Emqx-Api "PUT" $EmqxDashboardHost $headers "/api/v5/authorization/settings" $settings

Write-Host "EMQX HTTP authn/authz configured." -ForegroundColor Green
Write-Host ("- authn: " + $authnBody.url) -ForegroundColor DarkGray
Write-Host ("- authz: " + $authzHttpBody.url) -ForegroundColor DarkGray
Write-Host ("- token is stored in: " + $ApiEnvFile + " (EMQX_WEBHOOK_TOKEN)") -ForegroundColor DarkGray
Write-Host ("- internal MQTT password is stored in: " + $ApiEnvFile + " (MQTT_INTERNAL_PASSWORD)") -ForegroundColor DarkGray
