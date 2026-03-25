$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tsFile = Join-Path $repoRoot "scripts/dev/check-desk-station-management-panel.ts"

npx tsx $tsFile

if ($LASTEXITCODE -ne 0) {
  throw "check-desk-station-management-panel failed (exit=$LASTEXITCODE)"
}
