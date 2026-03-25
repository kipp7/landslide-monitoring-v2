$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tsFile = Join-Path $repoRoot "scripts/dev/check-desk-system-page-actions.ts"

powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/restart-local-api-service.ps1") -SkipBuild | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "restart-local-api-service failed (exit=$LASTEXITCODE)"
}

& (Join-Path $repoRoot "scripts/dev/invoke-tsx.ps1") $tsFile

if ($LASTEXITCODE -ne 0) {
  throw "desk system page proof failed (exit=$LASTEXITCODE)"
}

