[CmdletBinding()]
param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$EnvTemplate = "infra/compose/env.example",
  [string]$ComposeBase = "infra/compose/docker-compose.yml",
  [string]$ComposeApp = "infra/compose/docker-compose.app.yml",
  [switch]$WithOps,
  [switch]$SeedDemo,
  [switch]$ValidateOnly,
  [switch]$AllowUnsafeSecrets
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

function Read-DotEnv([string]$path) {
  $map = [ordered]@{}
  foreach ($line in Get-Content -Path $path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }
    $idx = $trimmed.IndexOf("=")
    if ($idx -lt 1) {
      continue
    }
    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()
    $map[$key] = $value
  }
  return $map
}

function Test-PlaceholderSecret([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $true }
  $v = $value.Trim()
  return $v -in @("change-me", "changeme", "your-secret", "replace-me")
}

function Invoke-Step([string]$label, [scriptblock]$action) {
  Write-Host "==> $label" -ForegroundColor Cyan
  & $action
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed (exit=$LASTEXITCODE)"
  }
}

$repoRoot = Resolve-RepoRoot
$fullEnvFile = Join-Path $repoRoot $EnvFile
$fullEnvTemplate = Join-Path $repoRoot $EnvTemplate
$fullComposeBase = Join-Path $repoRoot $ComposeBase
$fullComposeApp = Join-Path $repoRoot $ComposeApp
$reportFile = Join-Path $repoRoot "docs/unified/reports/docker-deploy-latest.json"

if (-not (Test-Path $fullEnvFile)) {
  if (-not (Test-Path $fullEnvTemplate)) {
    throw "env template not found: $EnvTemplate"
  }
  Copy-Item -Force $fullEnvTemplate $fullEnvFile
  $envCreated = $true
} else {
  $envCreated = $false
}

if (-not (Test-Path $fullComposeBase)) {
  throw "compose file not found: $ComposeBase"
}
if (-not (Test-Path $fullComposeApp)) {
  throw "compose file not found: $ComposeApp"
}

$envMap = Read-DotEnv $fullEnvFile
$warnings = New-Object System.Collections.Generic.List[string]
$errors = New-Object System.Collections.Generic.List[string]

$requiredKeys = @("PG_PASSWORD", "CH_PASSWORD", "REDIS_PASSWORD", "EMQX_DASHBOARD_PASSWORD")
foreach ($key in $requiredKeys) {
  if (-not $envMap.Contains($key)) {
    $errors.Add("missing env key: $key")
    continue
  }
  if (Test-PlaceholderSecret ([string]$envMap[$key])) {
    $warnings.Add("placeholder secret detected: $key")
  }
}

$authRequired = if ($envMap.Contains("AUTH_REQUIRED")) { [string]$envMap["AUTH_REQUIRED"] } else { "true" }
if ($authRequired.Trim().ToLowerInvariant() -eq "true") {
  foreach ($key in @("JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET")) {
    if (-not $envMap.Contains($key)) {
      $errors.Add("missing env key: $key")
      continue
    }
    if (Test-PlaceholderSecret ([string]$envMap[$key])) {
      $warnings.Add("placeholder secret detected: $key")
    }
  }
}

$dockerExists = [bool](Get-Command docker -ErrorAction SilentlyContinue)
if (-not $dockerExists) {
  $warnings.Add("docker command not found in PATH")
}

$unsafeSecrets = @($warnings | Where-Object { $_ -like "placeholder secret detected:*" }).Count -gt 0
if ($unsafeSecrets -and -not $AllowUnsafeSecrets.IsPresent) {
  $errors.Add("unsafe placeholder secrets remain; pass -AllowUnsafeSecrets only for local/dev usage")
}

$composeArgs = @(
  "compose",
  "-f", $fullComposeBase,
  "-f", $fullComposeApp,
  "--env-file", $fullEnvFile
)
if ($WithOps.IsPresent) {
  $composeArgs += @("--profile", "ops")
}

$started = $false
$initialized = $false
$seeded = $false

if (-not $ValidateOnly.IsPresent) {
  if ($errors.Count -gt 0) {
    throw "docker one-click deploy blocked: $($errors -join '; ')"
  }
  if (-not $dockerExists) {
    throw "docker not found in PATH"
  }

  Invoke-Step "Docker compose up" {
    & docker @composeArgs up -d
  }
  $started = $true

  Invoke-Step "Init PostgreSQL" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "infra/compose/scripts/init-postgres.ps1") -EnvFile $fullEnvFile -ComposeFile $fullComposeBase
  }
  Invoke-Step "Init ClickHouse" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "infra/compose/scripts/init-clickhouse.ps1") -EnvFile $fullEnvFile -ComposeFile $fullComposeBase
  }
  Invoke-Step "Create Kafka topics" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "infra/compose/scripts/create-kafka-topics.ps1") -EnvFile $fullEnvFile -ComposeFile $fullComposeBase
  }
  $initialized = $true

  if ($SeedDemo.IsPresent) {
    Invoke-Step "Seed demo data" {
      powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "infra/compose/scripts/seed-demo.ps1")
    }
    $seeded = $true
  }
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  envFile = $EnvFile
  envCreated = $envCreated
  validateOnly = [bool]$ValidateOnly.IsPresent
  withOps = [bool]$WithOps.IsPresent
  allowUnsafeSecrets = [bool]$AllowUnsafeSecrets.IsPresent
  docker = [ordered]@{
    commandFound = $dockerExists
  }
  compose = [ordered]@{
    base = $ComposeBase
    app = $ComposeApp
  }
  status = [ordered]@{
    started = $started
    initialized = $initialized
    seeded = $seeded
  }
  warnings = @($warnings)
  errors = @($errors)
  nextCommands = @(
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release/deploy-docker-oneclick.ps1 -AllowUnsafeSecrets",
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release/deploy-docker-oneclick.ps1 -AllowUnsafeSecrets -WithOps",
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release/deploy-docker-oneclick.ps1 -AllowUnsafeSecrets -SeedDemo"
  )
}

$json = $result | ConvertTo-Json -Depth 8
$reportDir = Split-Path -Parent $reportFile
if ($reportDir -and -not (Test-Path $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}
Set-Content -Path $reportFile -Value $json -Encoding UTF8
$json
