$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$jsFile = Join-Path $repoRoot "scripts/dev/generate-hardware-stable-version-gateway-command-samples.js"
$outFile = Join-Path $repoRoot "docs/unified/reports/hardware-stable-version-gateway-command-samples-latest.json"

$output = node $jsFile | Out-String

if ($LASTEXITCODE -ne 0) {
  throw "hardware stable version gateway command sample generation failed (exit=$LASTEXITCODE)"
}

$trimmed = $output.Trim()
Set-Content -Path $outFile -Value $trimmed -Encoding UTF8
$trimmed
