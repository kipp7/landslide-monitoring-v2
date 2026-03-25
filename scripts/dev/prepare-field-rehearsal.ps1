[CmdletBinding()]
param(
  [string]$Scope = "node-gateway",
  [string]$Stamp = "",
  [string]$Samples = "hf-normal,hf-duplicate,hf-out-of-order,hf-oversized,hf-replay,lf-meta"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $args = @("scripts/dev/prepare-field-rehearsal.js", "--scope", $Scope, "--samples", $Samples)
  if ($Stamp) {
    $args += @("--stamp", $Stamp)
  }

  & node @args
  if ($LASTEXITCODE -ne 0) {
    throw "prepare-field-rehearsal failed (exit=$LASTEXITCODE)"
  }
} finally {
  Pop-Location
}
