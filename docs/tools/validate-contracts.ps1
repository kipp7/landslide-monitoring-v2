$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
$scriptPath = Join-Path $repoRoot "重构计划\\tools\\validate-contracts.py"

python $scriptPath

