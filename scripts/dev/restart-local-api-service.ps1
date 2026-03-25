param(
  [int]$Port = 8081,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$apiDir = Join-Path $repoRoot "services/api"
$entry = Join-Path $apiDir "dist/index.js"

if (-not $SkipBuild) {
  Push-Location $repoRoot
  try {
    npm -w services/api run build
    if ($LASTEXITCODE -ne 0) {
      throw "services/api build failed (exit=$LASTEXITCODE)"
    }
  } finally {
    Pop-Location
  }
}

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
  try {
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
  } catch {
    if (Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue) {
      throw "failed stopping process on port $Port pid=$($listener.OwningProcess): $($_.Exception.Message)"
    }
  }
}

$portReleaseDeadline = (Get-Date).AddSeconds(10)
do {
  Start-Sleep -Milliseconds 300
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
} while ($listeners -and (Get-Date) -lt $portReleaseDeadline)

if ($listeners) {
  $pids = @($listeners | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique)
  throw "port $Port still in use after stop attempt: $($pids -join ',')"
}

Start-Sleep -Seconds 2

$nodeProcs = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "node.exe" -and (
    $_.CommandLine -like "*services\\api\\dist\\index.js*" -or
    $_.CommandLine -like "*$entry*"
  )
}

foreach ($proc in $nodeProcs) {
  try {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
  } catch {
    throw "failed stopping api-service pid=$($proc.ProcessId): $($_.Exception.Message)"
  }
}

$p = Start-Process -FilePath node -ArgumentList "dist/index.js" -WorkingDirectory $apiDir -PassThru

$deadline = (Get-Date).AddSeconds(45)
do {
  Start-Sleep -Milliseconds 500
  try {
    $resp = Invoke-WebRequest "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -eq 200) {
      [pscustomobject]@{
        restarted = $true
        pid = $p.Id
        port = $Port
        health = ($resp.Content | ConvertFrom-Json)
      } | ConvertTo-Json -Depth 6
      exit 0
    }
  } catch {
    # wait until deadline
  }
} while ((Get-Date) -lt $deadline)

Start-Sleep -Seconds 2
$retry = Start-Process -FilePath node -ArgumentList "dist/index.js" -WorkingDirectory $apiDir -PassThru
$retryDeadline = (Get-Date).AddSeconds(20)
do {
  Start-Sleep -Milliseconds 500
  try {
    $resp = Invoke-WebRequest "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -eq 200) {
      [pscustomobject]@{
        restarted = $true
        pid = $retry.Id
        port = $Port
        health = ($resp.Content | ConvertFrom-Json)
        retried = $true
      } | ConvertTo-Json -Depth 6
      exit 0
    }
  } catch {
    # wait until retry deadline
  }
} while ((Get-Date) -lt $retryDeadline)

try {
  $resp = Invoke-WebRequest "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 2
  if ($resp.StatusCode -eq 200) {
    [pscustomobject]@{
      restarted = $true
      pid = $retry.Id
      port = $Port
      health = ($resp.Content | ConvertFrom-Json)
      retried = $true
    } | ConvertTo-Json -Depth 6
    exit 0
  }
} catch {
  # fall through
}

throw "api-service did not become healthy on port $Port in time"
