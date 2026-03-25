[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  node "scripts/dev/check-field-rehearsal-samples.js"
  if ($LASTEXITCODE -ne 0) {
    throw "field rehearsal sample check failed (exit=$LASTEXITCODE)"
  }
} finally {
  Pop-Location
}
