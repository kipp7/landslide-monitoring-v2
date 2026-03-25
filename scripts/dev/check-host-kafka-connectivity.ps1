[CmdletBinding()]
param(
  [string]$Broker = "127.0.0.1:9094",
  [string]$OutFile = "docs/unified/reports/host-kafka-connectivity-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $output = & node --no-warnings "scripts/dev/check-host-kafka-connectivity.js" "--broker" $Broker 2>&1 | Out-String
  $raw = $output.Trim()
  $fullOutFile = Join-Path $repoRoot $OutFile
  $outDir = Split-Path -Parent $fullOutFile
  if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }
  Set-Content -Path $fullOutFile -Value $raw -Encoding UTF8
  $raw
  if ($LASTEXITCODE -ne 0) {
    throw "host kafka connectivity check failed (exit=$LASTEXITCODE)"
  }
} finally {
  Pop-Location
}
