$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tsFile = Join-Path $repoRoot "scripts/dev/check-desk-gps-profile-alert-sensitivity.ts"

& (Join-Path $repoRoot "scripts/dev/invoke-tsx.ps1") $tsFile

if ($LASTEXITCODE -ne 0) {
  throw "desk gps profile alert sensitivity proof failed (exit=$LASTEXITCODE)"
}
