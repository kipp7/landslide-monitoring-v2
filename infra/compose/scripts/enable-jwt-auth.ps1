param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ApiEnvFile = "services/api/.env",
  [switch]$WriteServiceEnv,
  [switch]$NoAdminToken,
  [switch]$Force
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

function Ensure-FileFromExample([string]$path, [string]$examplePath) {
  if (Test-Path $path) { return }
  if (-not (Test-Path $examplePath)) { throw "Missing env example: $examplePath" }
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  Copy-Item -Force $examplePath $path
}

function Get-EnvValue([string]$path, [string]$key) {
  if (-not (Test-Path $path)) { return "" }
  $lines = Get-Content -Encoding UTF8 $path
  $last = ""
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t.StartsWith("#")) { continue }
    if (-not $t.StartsWith("$key=")) { continue }
    $v = $t.Substring($key.Length + 1).Trim()
    if ($v.Length -gt 0) { $last = $v }
  }
  return $last
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

function Ensure-EnvValue([string]$path, [string]$key, [string]$value, [switch]$force) {
  $existing = Get-EnvValue $path $key
  $needs = $force -or (-not $existing) -or ($existing -eq "change-me")
  if ($needs) { Set-OrAppendEnvValue $path $key $value }
}

function New-RandomHex([int]$length) {
  if ($length -lt 1) { throw "length must be positive" }
  return -join ((48..57) + (97..102) | Get-Random -Count $length | ForEach-Object { [char]$_ })
}

if (-not (Test-Path $EnvFile)) {
  throw "Missing env file: $EnvFile (copy infra/compose/env.example -> infra/compose/.env)"
}

Ensure-FileFromExample $ApiEnvFile "services/api/.env.example"

$infra = Read-EnvFile $EnvFile

if ($WriteServiceEnv) {
  if ($infra.ContainsKey("PG_HOST")) { Ensure-EnvValue $ApiEnvFile "POSTGRES_HOST" $infra["PG_HOST"] -force:$Force }
  if ($infra.ContainsKey("PG_PORT")) { Ensure-EnvValue $ApiEnvFile "POSTGRES_PORT" $infra["PG_PORT"] -force:$Force }
  if ($infra.ContainsKey("PG_USER")) { Ensure-EnvValue $ApiEnvFile "POSTGRES_USER" $infra["PG_USER"] -force:$Force }
  if ($infra.ContainsKey("PG_PASSWORD")) { Ensure-EnvValue $ApiEnvFile "POSTGRES_PASSWORD" $infra["PG_PASSWORD"] -force:$Force }
  if ($infra.ContainsKey("PG_DATABASE")) { Ensure-EnvValue $ApiEnvFile "POSTGRES_DATABASE" $infra["PG_DATABASE"] -force:$Force }

  if ($infra.ContainsKey("CH_HTTP_URL")) { Ensure-EnvValue $ApiEnvFile "CLICKHOUSE_URL" (Resolve-EnvTemplate $infra["CH_HTTP_URL"] $infra) -force:$Force }
  if ($infra.ContainsKey("CH_DATABASE")) { Ensure-EnvValue $ApiEnvFile "CLICKHOUSE_DATABASE" $infra["CH_DATABASE"] -force:$Force }
  if ($infra.ContainsKey("CH_USER")) { Ensure-EnvValue $ApiEnvFile "CLICKHOUSE_USERNAME" $infra["CH_USER"] -force:$Force }
  if ($infra.ContainsKey("CH_PASSWORD")) { Ensure-EnvValue $ApiEnvFile "CLICKHOUSE_PASSWORD" $infra["CH_PASSWORD"] -force:$Force }
}

Ensure-EnvValue $ApiEnvFile "AUTH_REQUIRED" "true" -force:$Force

Ensure-EnvValue $ApiEnvFile "JWT_ACCESS_SECRET" (New-RandomHex 64) -force:$Force
Ensure-EnvValue $ApiEnvFile "JWT_REFRESH_SECRET" (New-RandomHex 64) -force:$Force

if (-not $NoAdminToken) {
  Ensure-EnvValue $ApiEnvFile "ADMIN_API_TOKEN" (New-RandomHex 64) -force:$Force
} else {
  # Do not force-clear: if it's already set, keep it; if empty, keep empty.
  Write-Host "Skipping ADMIN_API_TOKEN (NoAdminToken)." -ForegroundColor DarkGray
}

Write-Host "JWT auth enabled for api-service." -ForegroundColor Green
Write-Host "- Updated: $ApiEnvFile" -ForegroundColor DarkGray
Write-Host "- Set: AUTH_REQUIRED=true, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET" -ForegroundColor DarkGray
if (-not $NoAdminToken) {
  Write-Host "- Set: ADMIN_API_TOKEN (break-glass admin)" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "Next steps (recommended):" -ForegroundColor Cyan
Write-Host "1) Start api-service (and infra): see docs/guides/testing/e2e-smoke-test.md" -ForegroundColor DarkGray
Write-Host "2) Use ADMIN_API_TOKEN once to create your first user+role via Web: /admin/users" -ForegroundColor DarkGray
Write-Host "3) Then login via Web: /login (JWT) and stop using the admin token for daily ops" -ForegroundColor DarkGray

