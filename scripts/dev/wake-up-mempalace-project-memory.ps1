[CmdletBinding()]
param(
  [string]$Wing = "landslide_monitoring_v2_mainline",
  [string]$OutFile,
  [int]$NativeTimeoutSeconds = 20
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$commonScript = Join-Path $repoRoot "scripts\dev\mempalace-project-common.ps1"
$mempalaceExe = Join-Path $repoRoot ".tools\mempalace\.venv\Scripts\mempalace.exe"
$venvPython = Join-Path $repoRoot ".tools\mempalace\.venv\Scripts\python.exe"
$palacePath = Join-Path $repoRoot ".tools\mempalace\palace"
$fallbackScript = Join-Path $repoRoot "scripts\dev\mempalace_project_wakeup.py"

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
  Write-Warning "MemPalace index is stale; background refresh started. Wake-up will use the last completed index snapshot first."
}

$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

$nativeCommandParts = @(
  "&",
  (Convert-ToPsSingleQuotedLiteral -Value $mempalaceExe),
  "--palace",
  (Convert-ToPsSingleQuotedLiteral -Value $palacePath),
  "wake-up"
)
if ($Wing) {
  $nativeCommandParts += @("--wing", (Convert-ToPsSingleQuotedLiteral -Value $Wing))
}
$nativeCommand = $nativeCommandParts -join " "

$nativeStdout = Join-Path $repoRoot ".tmp\mempalace\native-wakeup.stdout.log"
$nativeStderr = Join-Path $repoRoot ".tmp\mempalace\native-wakeup.stderr.log"
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

$output = if (Test-Path $nativeStdout) { @(Get-Content $nativeStdout) } else { @() }
if ($timedOut -or $proc.ExitCode -ne 0 -or -not $output -or ($output -join [Environment]::NewLine) -match "No memories yet") {
  if ($timedOut) {
    Write-Warning "MemPalace native wake-up timed out after $NativeTimeoutSeconds seconds; falling back to sqlite wake-up."
  }
  Write-Warning "MemPalace wake-up unavailable; falling back to sqlite wake-up."
  $fallbackArgs = @($fallbackScript, "--palace", $palacePath)
  if ($Wing) {
    $fallbackArgs += @("--wing", $Wing)
  }
  $output = & $venvPython @fallbackArgs
  if ($LASTEXITCODE -ne 0) {
    throw "sqlite fallback wake-up failed (exit=$LASTEXITCODE)"
  }
}

if ($OutFile) {
  Set-Content -Path $OutFile -Value ($output -join [Environment]::NewLine) -Encoding utf8
}

$output
