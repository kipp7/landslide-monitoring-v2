$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tsFile = Join-Path $repoRoot "scripts/dev/check-web-command-notify-on-ack.ts"
$outFile = Join-Path $repoRoot "docs/unified/reports/web-command-notify-on-ack-proof-latest.json"

try {
  $null = Invoke-WebRequest "http://127.0.0.1:8081/health" -UseBasicParsing -TimeoutSec 2
} catch {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/restart-local-api-service.ps1") -SkipBuild | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "restart-local-api-service failed (exit=$LASTEXITCODE)"
  }
}

$output = & (Join-Path $repoRoot "scripts/dev/invoke-tsx.ps1") $tsFile | Out-String

if ($LASTEXITCODE -ne 0) {
  throw "web command notifyOnAck proof failed (exit=$LASTEXITCODE)"
}

$trimmed = $output.Trim()
$outDir = Split-Path -Parent $outFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $outFile -Value $trimmed -Encoding UTF8
$trimmed
