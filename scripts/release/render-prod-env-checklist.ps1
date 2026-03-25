[CmdletBinding()]
param(
  [string]$EnvTemplateFile = "infra/compose/env.prod.example",
  [string]$EnvFile = "infra/compose/.env",
  [string]$OutJsonFile = "docs/unified/reports/prod-env-checklist-latest.json",
  [string]$OutMdFile = "docs/unified/reports/prod-env-checklist-latest.md"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-DotEnv([string]$path) {
  $map = [ordered]@{}
  foreach ($line in Get-Content -Path $path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $idx = $trimmed.IndexOf("=")
    if ($idx -lt 1) { continue }
    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()
    $map[$key] = $value
  }
  return $map
}

function Test-PlaceholderValue([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $false }
  $v = $value.Trim().ToLowerInvariant()
  return $v -in @("change-me", "change-me-please", "changeme", "replace-me", "your-secret")
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullTemplateFile = Join-Path $repoRoot $EnvTemplateFile
$fullEnvFile = Join-Path $repoRoot $EnvFile
$fullOutJsonFile = Join-Path $repoRoot $OutJsonFile
$fullOutMdFile = Join-Path $repoRoot $OutMdFile

if (-not (Test-Path $fullTemplateFile)) {
  throw "env template not found: $EnvTemplateFile"
}
if (-not (Test-Path $fullEnvFile)) {
  throw "env file not found: $EnvFile"
}

$template = Read-DotEnv $fullTemplateFile
$current = Read-DotEnv $fullEnvFile

$spec = @(
  @{ key = "TZ"; category = "base"; required = $true; note = "timezone" },
  @{ key = "DATA_DIR"; category = "base"; required = $true; note = "data directory" },
  @{ key = "PG_USER"; category = "postgres"; required = $true; note = "database user" },
  @{ key = "PG_PASSWORD"; category = "postgres"; required = $true; note = "database password" },
  @{ key = "PG_DATABASE"; category = "postgres"; required = $true; note = "database name" },
  @{ key = "PG_PORT"; category = "postgres"; required = $true; note = "database port" },
  @{ key = "CH_DATABASE"; category = "clickhouse"; required = $true; note = "timeseries database name" },
  @{ key = "CH_USER"; category = "clickhouse"; required = $true; note = "timeseries database user" },
  @{ key = "CH_PASSWORD"; category = "clickhouse"; required = $true; note = "timeseries database password" },
  @{ key = "REDIS_PASSWORD"; category = "redis"; required = $true; note = "redis password" },
  @{ key = "EMQX_DASHBOARD_USER"; category = "emqx"; required = $true; note = "dashboard user" },
  @{ key = "EMQX_DASHBOARD_PASSWORD"; category = "emqx"; required = $true; note = "dashboard password" },
  @{ key = "AUTH_REQUIRED"; category = "security"; required = $true; note = "enable auth" },
  @{ key = "JWT_ACCESS_SECRET"; category = "security"; required = $true; note = "access token secret" },
  @{ key = "JWT_REFRESH_SECRET"; category = "security"; required = $true; note = "refresh token secret" },
  @{ key = "ADMIN_API_TOKEN"; category = "security"; required = $false; note = "admin api token" },
  @{ key = "DB_ADMIN_ENABLED"; category = "security"; required = $true; note = "db admin endpoint switch" },
  @{ key = "CORS_ORIGINS"; category = "api"; required = $false; note = "frontend origin allowlist" },
  @{ key = "KAFKA_BROKERS"; category = "kafka"; required = $false; note = "kafka brokers" },
  @{ key = "KAFKA_UI_PORT"; category = "kafka"; required = $false; note = "kafka ui port" }
)

$rows = foreach ($item in $spec) {
  $key = [string]$item.key
  $currentValue = if ($current.Contains($key)) { [string]$current[$key] } else { "" }
  $templateValue = if ($template.Contains($key)) { [string]$template[$key] } else { "" }
  $present = $current.Contains($key)
  $placeholder = Test-PlaceholderValue $currentValue
  $status =
    if (-not $present -or ([string]::IsNullOrWhiteSpace($currentValue) -and [bool]$item.required)) { "missing" }
    elseif ($placeholder) { "placeholder" }
    elseif ([string]::IsNullOrWhiteSpace($currentValue)) { "empty_optional" }
    else { "configured" }

  [ordered]@{
    key = $key
    category = [string]$item.category
    required = [bool]$item.required
    status = $status
    currentValueMasked =
      if ([string]::IsNullOrWhiteSpace($currentValue)) { "" }
      elseif ($key -match "PASSWORD|SECRET|TOKEN") { "***" }
      else { $currentValue }
    templateValueMasked =
      if ([string]::IsNullOrWhiteSpace($templateValue)) { "" }
      elseif ($key -match "PASSWORD|SECRET|TOKEN") { "***" }
      else { $templateValue }
    note = [string]$item.note
  }
}

$summary = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  envFile = $EnvFile
  templateFile = $EnvTemplateFile
  total = @($rows).Count
  configured = @($rows | Where-Object { $_.status -eq "configured" }).Count
  placeholder = @($rows | Where-Object { $_.status -eq "placeholder" }).Count
  missing = @($rows | Where-Object { $_.status -eq "missing" }).Count
  emptyOptional = @($rows | Where-Object { $_.status -eq "empty_optional" }).Count
}

$result = [ordered]@{
  summary = $summary
  items = @($rows)
}

$json = $result | ConvertTo-Json -Depth 8
$jsonDir = Split-Path -Parent $fullOutJsonFile
if ($jsonDir -and -not (Test-Path $jsonDir)) {
  New-Item -ItemType Directory -Path $jsonDir -Force | Out-Null
}
Set-Content -Path $fullOutJsonFile -Value $json -Encoding UTF8

$md = @(
  "# Production Environment Checklist",
  "",
  "- GeneratedAt: $($summary.generatedAt)",
  "- EnvFile: $EnvFile",
  "- TemplateFile: $EnvTemplateFile",
  "- Total: $($summary.total)",
  "- Configured: $($summary.configured)",
  "- Placeholder: $($summary.placeholder)",
  "- Missing: $($summary.missing)",
  "- EmptyOptional: $($summary.emptyOptional)",
  "",
  "| Key | Category | Required | Status | Current | Note |",
  "| --- | --- | --- | --- | --- | --- |"
)

foreach ($row in $rows) {
  $md += "| $($row.key) | $($row.category) | $($row.required) | $($row.status) | $($row.currentValueMasked) | $($row.note) |"
}

$mdDir = Split-Path -Parent $fullOutMdFile
if ($mdDir -and -not (Test-Path $mdDir)) {
  New-Item -ItemType Directory -Path $mdDir -Force | Out-Null
}
Set-Content -Path $fullOutMdFile -Value ($md -join [Environment]::NewLine) -Encoding UTF8

$json
