[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Query,
  [string]$Wing = "landslide_monitoring_v2_mainline",
  [string]$Room,
  [int]$Results = 8,
  [int]$NativeTimeoutSeconds = 20
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$commonScript = Join-Path $repoRoot "scripts\dev\mempalace-project-common.ps1"
$mempalaceExe = Join-Path $repoRoot ".tools\mempalace\.venv\Scripts\mempalace.exe"
$venvPython = Join-Path $repoRoot ".tools\mempalace\.venv\Scripts\python.exe"
$palacePath = Join-Path $repoRoot ".tools\mempalace\palace"
$fallbackScript = Join-Path $repoRoot "scripts\dev\mempalace_project_search.py"

. $commonScript

function Convert-ToPsSingleQuotedLiteral {
  param([Parameter(Mandatory = $true)][string]$Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

if (-not (Test-Path $mempalaceExe)) {
  throw "MemPalace is not installed. Run install-mempalace-project-memory.ps1 first."
}

$state = Get-MempalaceProjectState -RepoRoot $repoRoot
$refreshStart = Start-MempalaceRefreshIfStale -Paths $state.paths -State $state
if ($refreshStart.started) {
  Write-Warning "MemPalace index is stale; background refresh started. Current search will use the last completed index snapshot."
}

$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

$nativeCommandParts = @(
  "&",
  (Convert-ToPsSingleQuotedLiteral -Value $mempalaceExe),
  "--palace",
  (Convert-ToPsSingleQuotedLiteral -Value $palacePath),
  "search",
  (Convert-ToPsSingleQuotedLiteral -Value $Query),
  "--results",
  "$Results"
)
if ($Wing) {
  $nativeCommandParts += @("--wing", (Convert-ToPsSingleQuotedLiteral -Value $Wing))
}
if ($Room) {
  $nativeCommandParts += @("--room", (Convert-ToPsSingleQuotedLiteral -Value $Room))
}
$nativeCommand = $nativeCommandParts -join " "

$nativeStdout = Join-Path $repoRoot ".tmp\mempalace\native-search.stdout.log"
$nativeStderr = Join-Path $repoRoot ".tmp\mempalace\native-search.stderr.log"
foreach ($path in @($nativeStdout, $nativeStderr)) {
  if (Test-Path $path) {
    Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  }
}

$proc = Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $nativeCommand) `
  -RedirectStandardOutput $nativeStdout `
  -RedirectStandardError $nativeStderr `
  -PassThru
$timedOut = $false
try {
  Wait-Process -Id $proc.Id -Timeout $NativeTimeoutSeconds -ErrorAction Stop
} catch {
  $timedOut = $true
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

if (-not $timedOut -and $proc.ExitCode -eq 0) {
  if (Test-Path $nativeStdout) {
    Get-Content $nativeStdout
  }
  exit 0
}

if ($timedOut) {
  Write-Warning "MemPalace native search timed out after $NativeTimeoutSeconds seconds; falling back to sqlite search."
} else {
  Write-Warning "MemPalace search failed; falling back to sqlite search."
}

$fallbackArgs = @($fallbackScript, "--palace", $palacePath, "--query", $Query, "--results", "$Results")
if ($Wing) {
  $fallbackArgs += @("--wing", $Wing)
}
if ($Room) {
  $fallbackArgs += @("--room", $Room)
}

& $venvPython @fallbackArgs
if ($LASTEXITCODE -ne 0) {
  throw "sqlite fallback search failed (exit=$LASTEXITCODE)"
}
