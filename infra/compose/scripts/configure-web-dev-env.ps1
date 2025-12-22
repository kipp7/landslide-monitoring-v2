param(
  [string]$ApiBaseUrl = "http://localhost:8080",
  [string]$ApiEnvFile = "services/api/.env",
  [string]$WebEnvFile = "apps/web/.env.local",
  [switch]$WriteBearerTokenFromAdmin,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Read-EnvFile([string]$path) {
  if (-not (Test-Path $path)) { return @{} }
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

function Ensure-FileExists([string]$path) {
  if (Test-Path $path) { return }
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  Set-Content -Encoding UTF8 -Path $path -Value ""
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

function Ensure-EnvValue([string]$path, [string]$key, [string]$value, [switch]$force) {
  $existing = ""
  if (Test-Path $path) {
    $lines = Get-Content -Encoding UTF8 $path
    foreach ($line in $lines) {
      $t = $line.Trim()
      if ($t.StartsWith("#")) { continue }
      if (-not $t.StartsWith("$key=")) { continue }
      $existing = $t.Substring($key.Length + 1).Trim()
    }
  }
  $needs = $force -or (-not $existing) -or ($existing -eq "change-me")
  if ($needs) { Set-OrAppendEnvValue $path $key $value }
}

$apiBase = $ApiBaseUrl.Trim().TrimEnd("/")
if (-not $apiBase) { throw "ApiBaseUrl is empty." }

Ensure-FileExists $WebEnvFile

Ensure-EnvValue $WebEnvFile "NEXT_PUBLIC_API_BASE_URL" $apiBase -force:$Force

if ($WriteBearerTokenFromAdmin) {
  $apiEnv = Read-EnvFile $ApiEnvFile
  $admin = ""
  if ($apiEnv.ContainsKey("ADMIN_API_TOKEN")) { $admin = [string]$apiEnv["ADMIN_API_TOKEN"] }
  if (-not $admin -or $admin -eq "change-me") {
    throw "ADMIN_API_TOKEN missing in $ApiEnvFile. Run: infra/compose/scripts/enable-jwt-auth.ps1 -WriteServiceEnv"
  }
  Ensure-EnvValue $WebEnvFile "NEXT_PUBLIC_API_BEARER_TOKEN" $admin -force:$Force
}

Write-Host "Web dev env configured." -ForegroundColor Green
Write-Host "- Updated: $WebEnvFile" -ForegroundColor DarkGray
Write-Host "- Set: NEXT_PUBLIC_API_BASE_URL=$apiBase" -ForegroundColor DarkGray
if ($WriteBearerTokenFromAdmin) {
  Write-Host "- Set: NEXT_PUBLIC_API_BEARER_TOKEN (from ADMIN_API_TOKEN in $ApiEnvFile)" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1) Build+start api-service: npm -w services/api run build; npm -w services/api run start" -ForegroundColor DarkGray
Write-Host "2) Start web: npm -w apps/web run dev" -ForegroundColor DarkGray
Write-Host "3) First-time bootstrap: open http://localhost:3000/admin/users to create your first user, then login at /login" -ForegroundColor DarkGray

