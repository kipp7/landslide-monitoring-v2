param(
  [Parameter(Mandatory = $true)]
  [string]$TsFile
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tsxCmd = Join-Path $repoRoot "node_modules/.bin/tsx.cmd"

if (-not (Test-Path $tsxCmd)) {
  throw "tsx not found at $tsxCmd. Run 'npm install' in repo root first."
}

& $tsxCmd $TsFile

if ($LASTEXITCODE -ne 0) {
  throw "tsx execution failed (exit=$LASTEXITCODE)"
}
