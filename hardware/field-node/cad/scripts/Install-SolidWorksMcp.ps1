param(
    [string]$ToolRoot = (Join-Path $env:LOCALAPPDATA "Codex\SolidWorksMCP"),
    [string]$Upstream = "https://github.com/andrewbartels1/SolidworksMCP-python.git",
    [string]$PinnedCommit = "0de875502281df298695ef4733cae03fd11e450f",
    [string]$Python = "C:\Users\Administrator\AppData\Local\Programs\Python\Python311\python.exe"
)

$ErrorActionPreference = "Stop"
$source = Join-Path $ToolRoot "source"
$venvPython = Join-Path $source ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python 3.11 was not found at $Python"
}

if (-not (Test-Path -LiteralPath (Join-Path $source ".git"))) {
    New-Item -ItemType Directory -Force -Path $ToolRoot | Out-Null
    git clone $Upstream $source
    if ($LASTEXITCODE -ne 0) { throw "Failed to clone SolidWorks MCP upstream" }
}

$dirty = git -C $source status --porcelain
if ($dirty) {
    throw "The managed tool checkout has local changes. Review $source before updating it."
}

git -C $source fetch origin $PinnedCommit
if ($LASTEXITCODE -ne 0) { throw "Failed to fetch pinned commit $PinnedCommit" }
git -C $source checkout --detach $PinnedCommit
if ($LASTEXITCODE -ne 0) { throw "Failed to select pinned commit $PinnedCommit" }

if (-not (Test-Path -LiteralPath $venvPython)) {
    uv venv (Join-Path $source ".venv") --python $Python
    if ($LASTEXITCODE -ne 0) { throw "Failed to create the MCP virtual environment" }
}

uv pip install --python $venvPython -e $source
if ($LASTEXITCODE -ne 0) { throw "Failed to install SolidWorks MCP dependencies" }

& $venvPython -c "import solidworks_mcp, win32com.client; print('SolidWorks MCP installation OK')"
if ($LASTEXITCODE -ne 0) { throw "SolidWorks MCP import verification failed" }

Write-Host "Pinned upstream: $PinnedCommit"
Write-Host "Tool root: $ToolRoot"
