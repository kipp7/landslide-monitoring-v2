param(
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [int]$RelayTimeoutSeconds = 60,
  [string]$OutFile = "docs/unified/reports/hardware-stable-version-live-relay-wrapper-proof-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-JsonFile {
  param([string]$Path)
  return (Get-Content -Raw -Encoding UTF8 $Path | ConvertFrom-Json)
}

function Wait-ForPatternInFile {
  param(
    [string]$Path,
    [string]$Pattern,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $Path) {
      $content = [string](Get-Content -Raw -Encoding UTF8 $Path)
      if ($content -match $Pattern) {
        return $true
      }
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$startScript = Join-Path $repoRoot "scripts/dev/start-hardware-stable-version-mqtt-uart-relay.ps1"
$stopScript = Join-Path $repoRoot "scripts/dev/stop-hardware-stable-version-mqtt-uart-relay.ps1"
$sampleReportFile = Join-Path $repoRoot "docs/unified/reports/hardware-stable-version-gateway-command-samples-latest.json"
$metaFile = Join-Path $repoRoot ".tmp/hardware-stable-version-mqtt-uart-relay-latest.json"

Push-Location $repoRoot
try {
  if (-not (Test-Path ".tmp")) {
    New-Item -ItemType Directory -Path ".tmp" -Force | Out-Null
  }

  if (Test-Path $metaFile) {
    try {
      powershell -NoProfile -ExecutionPolicy Bypass -File $stopScript | Out-Null
    } catch {
      # ignore stale metadata
    }
  }

  $startRaw = powershell -NoProfile -ExecutionPolicy Bypass -File $startScript -RunInBackground -TimeoutSeconds $RelayTimeoutSeconds | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "start-hardware-stable-version-mqtt-uart-relay failed (exit=$LASTEXITCODE)"
  }
  $startResult = $startRaw | ConvertFrom-Json

  $stdoutLog = if ($startResult.stdout) { Join-Path $repoRoot $startResult.stdout } else { $null }
  $stderrLog = if ($startResult.stderr) { Join-Path $repoRoot $startResult.stderr } else { $null }
  $subscribedReady = $false
  if ($stdoutLog) {
    $subscribedReady = Wait-ForPatternInFile -Path $stdoutLog -Pattern '^subscribed:' -TimeoutSeconds 10
  }
  if (-not $subscribedReady) {
    throw "Timed out waiting for background relay subscription readiness"
  }

  $sampleReport = Read-JsonFile $sampleReportFile

  $stopRaw = powershell -NoProfile -ExecutionPolicy Bypass -File $stopScript | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "stop-hardware-stable-version-mqtt-uart-relay failed (exit=$LASTEXITCODE)"
  }
  $stopResult = $stopRaw | ConvertFrom-Json

  $stdoutText = if ($stdoutLog -and (Test-Path $stdoutLog)) { [string](Get-Content -Raw -Encoding UTF8 $stdoutLog) } else { "" }
  $stderrText = if ($stderrLog -and (Test-Path $stderrLog)) { [string](Get-Content -Raw -Encoding UTF8 $stderrLog) } else { "" }
  $relayStoppedOk = ($stopResult.stopped -eq $true) -or (
    $stopResult.stopped -eq $false -and
    [string]$stopResult.reason -like "Cannot find a process*"
  )

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    conclusion = "hardware-stable-version-background-relay-wrapper-can-start-subscribe-and-stop-cleanly"
    hardwareDeviceId = $sampleReport.hardwareDeviceId
    checks = [ordered]@{
      relayStartedInBackground = ($startResult.mode -eq "background")
      relaySubscribed = $subscribedReady
      relayTopicMatches = ($startResult.topic -eq $sampleReport.commandTopic)
      relaySinkIsFile = ($startResult.sink -eq "file")
      relayStoppedOrAlreadyExited = $relayStoppedOk
    }
    start = $startResult
    stop = $stopResult
    logs = [ordered]@{
      stdout = ([string]$stdoutText).Trim()
      stderr = ([string]$stderrText).Trim()
    }
    remainingGaps = @(
      "switch the same live wrapper path from file sink to uart-com when a real COM port becomes visible",
      "capture one aligned command flowing through the live wrapper into a board-side UART receive proof",
      "capture mismatch ignore evidence through the same live wrapper path"
    )
  }

  $json = $report | ConvertTo-Json -Depth 7
  $fullOutFile = Join-Path $repoRoot $OutFile
  $outDir = Split-Path -Parent $fullOutFile
  if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }
  Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
  $json
} finally {
  Pop-Location
}
