[CmdletBinding()]
param(
  [string]$OutDirRoot = "backups/evidence"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bundleDir = Join-Path $repoRoot $OutDirRoot
$bundleDir = Join-Path $bundleDir "field-host-triage-$stamp"

New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null

function Write-StepOutput([string]$name, [scriptblock]$action) {
  $outFile = Join-Path $bundleDir $name
  try {
    $output = & $action 2>&1 | Out-String
    Set-Content -Path $outFile -Value $output -Encoding UTF8
  } catch {
    Set-Content -Path $outFile -Value (($_ | Out-String).Trim()) -Encoding UTF8
  }
}

Write-StepOutput "field-local-runtime.json" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-field-local-runtime.ps1")
}

Write-StepOutput "field-docker-runtime.json" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-field-docker-runtime.ps1")
}

Write-StepOutput "field-docker-acceptance.json" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-field-docker-acceptance.ps1")
}

Write-StepOutput "field-runtime-delta.json" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-field-runtime-delta.ps1")
}

Write-StepOutput "field-host-path-context.json" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-field-host-path-context.ps1")
}

Write-StepOutput "field-host-remediation-plan.md" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/render-field-host-remediation-plan.ps1")
}

Write-StepOutput "docker-ps.txt" {
  docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
}

Write-StepOutput "docker-inspect-api-ports.txt" {
  docker inspect lsmv2_api --format "{{json .NetworkSettings.Ports}}"
}

Write-StepOutput "docker-inspect-web-ports.txt" {
  docker inspect lsmv2_web --format "{{json .NetworkSettings.Ports}}"
}

Write-StepOutput "docker-inspect-clickhouse-ports.txt" {
  docker inspect lsmv2_clickhouse --format "{{json .NetworkSettings.Ports}}"
}

Write-StepOutput "emqx-logs-tail.txt" {
  docker logs --tail 120 lsmv2_emqx
}

Write-StepOutput "wsl-status.txt" {
  wsl.exe --status
}

Write-StepOutput "wsl-version.txt" {
  wsl.exe --version
}

$summary = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  bundleDir = $bundleDir
  files = @(
    "field-local-runtime.json",
    "field-docker-runtime.json",
    "field-docker-acceptance.json",
    "field-runtime-delta.json",
    "field-host-path-context.json",
    "field-host-remediation-plan.md",
    "docker-ps.txt",
    "docker-inspect-api-ports.txt",
    "docker-inspect-web-ports.txt",
    "docker-inspect-clickhouse-ports.txt",
    "emqx-logs-tail.txt",
    "wsl-status.txt",
    "wsl-version.txt"
  )
}

$summaryPath = Join-Path $bundleDir "summary.json"
($summary | ConvertTo-Json -Depth 6) | Set-Content -Path $summaryPath -Encoding UTF8

[pscustomobject]@{
  generatedAt = $summary.generatedAt
  bundleDir = $bundleDir
  summary = $summaryPath
} | ConvertTo-Json -Depth 6
