param(
  [int]$ApiPort = 8081,
  [int]$DeskPort = 5174,
  [switch]$SkipApiBuild,
  [switch]$LaunchDeskWin
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$deskDir = Join-Path $repoRoot "apps/desk"
$deskWinProject = Join-Path $repoRoot "apps/desk-win/LandslideDesk.Win/LandslideDesk.Win.csproj"
$npmCmdInfo = Get-Command npm.cmd -ErrorAction SilentlyContinue
$npmCmd = if ($npmCmdInfo) { $npmCmdInfo.Source } else { $null }
if (-not $npmCmd) {
  $npmInfo = Get-Command npm -ErrorAction SilentlyContinue
  $npmCmd = if ($npmInfo) { $npmInfo.Source } else { $null }
}
if (-not $npmCmd) {
  throw "npm not found"
}

& (Join-Path $repoRoot "scripts/dev/restart-local-api-service.ps1") -Port $ApiPort -SkipBuild:$SkipApiBuild | Out-Null

$deskListeners = Get-NetTCPConnection -LocalPort $DeskPort -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $deskListeners) {
  try {
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
  } catch {
    if (Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue) {
      throw "failed stopping desk dev server pid=$($listener.OwningProcess): $($_.Exception.Message)"
    }
  }
}

$deskProc = Start-Process -FilePath $npmCmd -ArgumentList @("-w", "apps/desk", "run", "dev") -WorkingDirectory $repoRoot -PassThru
$deskProbeUrls = @("http://[::1]:$DeskPort", "http://localhost:$DeskPort")

$deadline = (Get-Date).AddSeconds(25)
do {
  Start-Sleep -Milliseconds 500
  foreach ($url in $deskProbeUrls) {
    try {
      $resp = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        $deskReadyUrl = $url
        break
      }
    } catch {
      # wait until ready
    }
  }
  if ($deskReadyUrl) { break }
} while ((Get-Date) -lt $deadline)

if (-not $deskReadyUrl) {
  throw "desk dev server did not become ready on port $DeskPort in time"
}

$deskWinPid = $null
if ($LaunchDeskWin) {
  $env:DESK_DEV_SERVER_URL = "http://localhost:$DeskPort/"
  $deskWin = Start-Process -FilePath "dotnet" -ArgumentList @("run", "--project", $deskWinProject) -WorkingDirectory $repoRoot -PassThru
  $deskWinPid = $deskWin.Id
}

[pscustomobject]@{
  restarted = $true
  apiPort = $ApiPort
  deskPort = $DeskPort
  deskPid = $deskProc.Id
  deskWinPid = $deskWinPid
  deskUrl = $deskReadyUrl
} | ConvertTo-Json -Depth 4
