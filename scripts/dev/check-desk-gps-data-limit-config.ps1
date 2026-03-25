$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tsFile = Join-Path $repoRoot "scripts/dev/check-desk-gps-data-limit-config.ts"

npx tsx $tsFile

if ($LASTEXITCODE -ne 0) {
  throw "check-desk-gps-data-limit-config failed (exit=$LASTEXITCODE)"
}
