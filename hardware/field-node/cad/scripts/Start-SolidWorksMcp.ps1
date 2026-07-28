param(
    [string]$ToolRoot = (Join-Path $env:LOCALAPPDATA "Codex\SolidWorksMCP")
)

$ErrorActionPreference = "Stop"
$source = Join-Path $ToolRoot "source"
$python = Join-Path $source ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
    [Console]::Error.WriteLine("SolidWorks MCP is not installed. Run Install-SolidWorksMcp.ps1 first.")
    exit 1
}

$env:PYTHONUTF8 = "1"
$env:SOLIDWORKS_MCP_SOLIDWORKS_YEAR = "2022"
$env:SOLIDWORKS_MCP_ADAPTER_TYPE = "pywin32"
$env:SOLIDWORKS_MCP_MOCK_SOLIDWORKS = "false"
$env:SOLIDWORKS_MCP_SECURITY_LEVEL = "strict"
$env:SOLIDWORKS_MCP_ENABLE_MACRO_RECORDING = "false"
$env:SOLIDWORKS_MCP_CONNECTION_POOLING = "false"
$env:SOLIDWORKS_MCP_MAX_CONNECTIONS = "1"
$env:SOLIDWORKS_MCP_LOG_LEVEL = "WARNING"
$env:SOLIDWORKS_MCP_DATA_DIR = (Join-Path $ToolRoot "data")

Set-Location -LiteralPath $source
& $python -m solidworks_mcp.server
exit $LASTEXITCODE
