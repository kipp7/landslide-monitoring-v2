$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tsFile = Join-Path $repoRoot "scripts/dev/check-desk-http-client.ts"
& (Join-Path $repoRoot "scripts/dev/invoke-tsx.ps1") $tsFile

if ($LASTEXITCODE -ne 0) {
  throw "desk http client proof failed (exit=$LASTEXITCODE)"
}

