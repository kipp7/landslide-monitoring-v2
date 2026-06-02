$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$script = Join-Path $repoRoot "scripts/dev/check-desk-mainline-proof.ps1"

powershell -NoProfile -ExecutionPolicy Bypass -File $script

if ($LASTEXITCODE -ne 0) {
  throw "desk mainline full proof failed (exit=$LASTEXITCODE)"
}
