param(
  [int]$ApiPort = 8081,
  [int]$DeskPort = 5174,
  [string]$OutFile = "docs/unified/reports/local-desk-mainline-runtime-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullOutFile = Join-Path $repoRoot $OutFile

function Get-ListeningProcess([int]$port) {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) { return $null }
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
  [pscustomobject]@{
    port = $port
    pid = $listener.OwningProcess
    localAddress = $listener.LocalAddress
    name = if ($proc) { $proc.Name } else { $null }
    commandLine = if ($proc) { $proc.CommandLine } else { $null }
  }
}

function Test-HttpOk([string]$url) {
  try {
    $resp = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2
    return [pscustomobject]@{
      ok = ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500)
      statusCode = $resp.StatusCode
      url = $url
    }
  } catch {
    return [pscustomobject]@{
      ok = $false
      statusCode = $null
      url = $url
      error = $_.Exception.Message
    }
  }
}

$apiProc = Get-ListeningProcess $ApiPort
$deskProc = Get-ListeningProcess $DeskPort
$deskWin = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -in @("LandslideDesk.Win.exe", "dotnet.exe") -and $_.CommandLine -like "*LandslideDesk.Win*"
} | Select-Object -First 1

$apiHealth = Test-HttpOk "http://127.0.0.1:$ApiPort/health"
$deskHealthIpv6 = Test-HttpOk "http://[::1]:$DeskPort"
$deskHealthLocalhost = Test-HttpOk "http://localhost:$DeskPort"

$json = ([pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  api = [pscustomobject]@{
    process = $apiProc
    health = $apiHealth
  }
  desk = [pscustomobject]@{
    process = $deskProc
    healthIpv6 = $deskHealthIpv6
    healthLocalhost = $deskHealthLocalhost
  }
  deskWin = [pscustomobject]@{
    running = [bool]($null -ne $deskWin)
    pid = if ($deskWin) { $deskWin.ProcessId } else { $null }
    name = if ($deskWin) { $deskWin.Name } else { $null }
    commandLine = if ($deskWin) { $deskWin.CommandLine } else { $null }
  }
} | ConvertTo-Json -Depth 8)

$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
$json
