[CmdletBinding()]
param(
  [switch]$ResetPalace,
  [switch]$Background,
  [string]$Agent = "codex",
  [int]$BatchMaxFiles = 20,
  [int]$BatchMaxBytes = 200000,
  [int]$MaxPasses = 400
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$venvPython = Join-Path $repoRoot ".tools\mempalace\.venv\Scripts\python.exe"
$mempalaceExe = Join-Path $repoRoot ".tools\mempalace\.venv\Scripts\mempalace.exe"
$palacePath = Join-Path $repoRoot ".tools\mempalace\palace"
$helperScript = Join-Path $repoRoot "scripts\dev\mempalace_project_refresh.py"
$logDir = Join-Path $repoRoot ".tmp\mempalace"
$stdoutPath = Join-Path $logDir "refresh.stdout.log"
$stderrPath = Join-Path $logDir "refresh.stderr.log"
$lockPath = Join-Path $logDir "refresh.lock.json"

function Get-ExistingRefreshLock {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LockPath
  )

  if (-not (Test-Path $LockPath)) {
    return $null
  }

  try {
    $lock = Get-Content $LockPath -Raw | ConvertFrom-Json
    $pid = [int]$lock.pid
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($null -eq $proc) {
      Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
      return $null
    }

    return [ordered]@{
      pid = $pid
      startedAt = $lock.startedAt
      runner = $lock.runner
      stdout = $lock.stdout
      stderr = $lock.stderr
    }
  } catch {
    Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
    return $null
  }
}

if (-not (Test-Path $venvPython) -or -not (Test-Path $mempalaceExe)) {
  throw "MemPalace is not installed. Run install-mempalace-project-memory.ps1 first."
}
if (-not (Test-Path $helperScript)) {
  throw "Missing helper script: $helperScript"
}
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

if ($ResetPalace -and (Test-Path $palacePath)) {
  Remove-Item -LiteralPath $palacePath -Recurse -Force
}
if (-not (Test-Path $palacePath)) {
  New-Item -ItemType Directory -Path $palacePath | Out-Null
}

if ($existingLock = Get-ExistingRefreshLock -LockPath $lockPath) {
  [ordered]@{
    started = $false
    background = [bool]$Background
    reason = "already-running"
    pid = $existingLock.pid
    stdout = $existingLock.stdout
    stderr = $existingLock.stderr
    startedAt = $existingLock.startedAt
  } | ConvertTo-Json -Depth 6
  exit 0
}

$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
$env:OMP_NUM_THREADS = "1"
$env:OPENBLAS_NUM_THREADS = "1"
$env:MKL_NUM_THREADS = "1"
$env:NUMEXPR_NUM_THREADS = "1"
$env:ORT_NUM_THREADS = "1"

if ($Background) {
  $sessionId = Get-Date -Format "yyyyMMdd-HHmmssfff"
  $stdoutPath = Join-Path $logDir ("refresh.{0}.stdout.log" -f $sessionId)
  $stderrPath = Join-Path $logDir ("refresh.{0}.stderr.log" -f $sessionId)
  $lock = [ordered]@{
    pid = $null
    startedAt = (Get-Date).ToString("s")
    repoRoot = $repoRoot
    runner = $helperScript
    stdout = $stdoutPath
    stderr = $stderrPath
  }
  $launcherScript = @"
& '$venvPython' '$helperScript' --repo-root '$repoRoot' --palace '$palacePath' --agent '$Agent' --max-files $BatchMaxFiles --max-bytes $BatchMaxBytes --max-passes $MaxPasses
"@
  $proc = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $launcherScript) `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru

  $lock.pid = $proc.Id
  try {
    $lock | ConvertTo-Json -Depth 6 | Set-Content -Path $lockPath -Encoding utf8
  } catch {
    if ($existingLock = Get-ExistingRefreshLock -LockPath $lockPath) {
      if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
      }
      [ordered]@{
        started = $false
        background = $true
        reason = "already-running"
        pid = $existingLock.pid
        stdout = $existingLock.stdout
        stderr = $existingLock.stderr
        startedAt = $existingLock.startedAt
      } | ConvertTo-Json -Depth 6
      exit 0
    }
    throw
  }

  [ordered]@{
    started = $true
    background = $true
    pid = $proc.Id
    stdout = $stdoutPath
    stderr = $stderrPath
    runner = $helperScript
    startedAt = (Get-Date).ToString("s")
    batchMaxFiles = $BatchMaxFiles
    batchMaxBytes = $BatchMaxBytes
  } | ConvertTo-Json -Depth 6
  exit 0
}

@{
  pid = $PID
  startedAt = (Get-Date).ToString("s")
  repoRoot = $repoRoot
  runner = $helperScript
} | ConvertTo-Json -Depth 6 | Set-Content -Path $lockPath -Encoding utf8

try {
  & $venvPython $helperScript --repo-root $repoRoot --palace $palacePath --agent $Agent --max-files $BatchMaxFiles --max-bytes $BatchMaxBytes --max-passes $MaxPasses 2>&1 | Tee-Object -FilePath $stdoutPath
  if ($LASTEXITCODE -ne 0) {
    throw "mempalace refresh failed (exit=$LASTEXITCODE)"
  }
}
finally {
  if (Test-Path $lockPath) {
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
  }
}
