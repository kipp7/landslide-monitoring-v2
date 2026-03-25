$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tsFile = Join-Path $repoRoot "scripts/dev/check-desk-device-diagnostics.ts"

& (Join-Path $repoRoot "scripts/dev/invoke-tsx.ps1") $tsFile

if ($LASTEXITCODE -ne 0) {
  throw "desk device diagnostics proof failed (exit=$LASTEXITCODE)"
}

