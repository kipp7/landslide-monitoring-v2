$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
$scriptPath = Join-Path $repoRoot "重构计划\\tools\\run-quality-gates.py"

python $scriptPath

