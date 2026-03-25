$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$jsFile = Join-Path $repoRoot "scripts/dev/simulate-hardware-stable-version-adaptation.js"
$outFile = Join-Path $repoRoot "docs/unified/reports/hardware-stable-version-adaptation-sim-latest.json"

$output = node $jsFile --outFile $outFile | Out-String

if ($LASTEXITCODE -ne 0) {
  throw "hardware stable version adaptation simulation failed (exit=$LASTEXITCODE)"
}

$output.Trim()
