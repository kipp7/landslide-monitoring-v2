param(
    [string]$ToolRoot = (Join-Path $env:LOCALAPPDATA "Codex\SolidWorksMCP")
)

$ErrorActionPreference = "Stop"
$source = Join-Path $ToolRoot "source"
$python = Join-Path $source ".venv\Scripts\python.exe"
$probe = Join-Path $PSScriptRoot "..\automation\mcp_smoke_test.py"

if (-not (Get-Process SLDWORKS -ErrorAction SilentlyContinue)) {
    throw "SOLIDWORKS is not running"
}
if (-not (Test-Path -LiteralPath $python)) {
    throw "SolidWorks MCP is not installed under $ToolRoot"
}

& $python $probe --server-script (Join-Path $PSScriptRoot "Start-SolidWorksMcp.ps1")
exit $LASTEXITCODE
