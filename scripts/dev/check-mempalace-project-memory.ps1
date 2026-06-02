[CmdletBinding()]
param(
  [int]$Tail = 20,
  [switch]$AutoStartRefreshIfStale
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$commonScript = Join-Path $repoRoot "scripts\dev\mempalace-project-common.ps1"
$venvPython = Join-Path $repoRoot ".tools\mempalace\.venv\Scripts\python.exe"
$palacePath = Join-Path $repoRoot ".tools\mempalace\palace"
$statusScript = Join-Path $repoRoot "scripts\dev\mempalace_project_status.py"
$stdoutPath = Join-Path $repoRoot ".tmp\mempalace\refresh.stdout.log"
$stderrPath = Join-Path $repoRoot ".tmp\mempalace\refresh.stderr.log"

. $commonScript

$state = Get-MempalaceProjectState -RepoRoot $repoRoot

$status = $null
if (-not (Test-Path $venvPython)) {
  $status = [ordered]@{ error = "MemPalace Python runtime not found." }
} elseif (-not (Test-Path $statusScript)) {
  $status = [ordered]@{ error = "Missing status helper script." }
} elseif (-not $state.refresh.running) {
  $env:PYTHONIOENCODING = "utf-8"
  $env:PYTHONUTF8 = "1"
  $status = (& $venvPython $statusScript --palace $palacePath | ConvertFrom-Json)
} else {
  $status = [ordered]@{ note = "Refresh is still running; quick status query skipped to avoid contention." }
}

$autoRefresh = $null
if ($AutoStartRefreshIfStale) {
  $autoRefresh = Start-MempalaceRefreshIfStale -Paths $state.paths -State $state
}

$effectiveStdoutPath = if ($state.refresh.stdout) { [string]$state.refresh.stdout } else { $stdoutPath }
$effectiveStderrPath = if ($state.refresh.stderr) { [string]$state.refresh.stderr } else { $stderrPath }
$showFixedStdout = $false
$showFixedStderr = $false
if (-not $state.refresh.running) {
  if (Test-Path $stdoutPath) {
    $stdoutItem = Get-Item $stdoutPath
    $showFixedStdout = ((Get-Date).ToUniversalTime() - $stdoutItem.LastWriteTimeUtc).TotalMinutes -le 5
  }
  if (Test-Path $stderrPath) {
    $stderrItem = Get-Item $stderrPath
    $showFixedStderr = ((Get-Date).ToUniversalTime() - $stderrItem.LastWriteTimeUtc).TotalMinutes -le 5
  }
}

[ordered]@{
  commandSurface = $state.commandSurface
  refresh = $state.refresh
  freshness = $state.freshness
  autoRefresh = if ($null -eq $autoRefresh) { $null } else { $autoRefresh }
  status = $status
  stdoutTail = if ($state.refresh.running -and (Test-Path $effectiveStdoutPath)) {
    @(Get-Content $effectiveStdoutPath -Tail $Tail)
  } elseif ($showFixedStdout) {
    @(Get-Content $stdoutPath -Tail $Tail)
  } else {
    @()
  }
  stderrTail = if ($state.refresh.running -and (Test-Path $effectiveStderrPath)) {
    @(Get-Content $effectiveStderrPath -Tail $Tail)
  } elseif ($showFixedStderr) {
    @(Get-Content $stderrPath -Tail $Tail)
  } else {
    @()
  }
} | ConvertTo-Json -Depth 8
