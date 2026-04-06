param(
  [string]$Sample = "manual_collect",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [int]$TimeoutSeconds = 12,
  [string]$Username = "ingest-service",
  [string]$Password = "",
  [string]$ApiEnvFile = "services/api/.env",
  [string]$OutFile = "docs/unified/reports/hardware-stable-version-mqtt-command-publish-proof-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-JsonFile {
  param([string]$Path)
  return (Get-Content -Raw -Encoding UTF8 $Path | ConvertFrom-Json)
}

function Read-EnvValue {
  param(
    [string]$Path,
    [string]$Key
  )

  if (-not (Test-Path $Path)) { return $null }
  $lines = Get-Content -Encoding UTF8 $Path
  $last = $null
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t.StartsWith("#")) { continue }
    if ($t.StartsWith("$Key=")) {
      $v = $t.Substring($Key.Length + 1).Trim()
      if ($v.Length -gt 0) { $last = $v }
    }
  }
  return $last
}

function Wait-NodeProcess {
  param(
    [System.Diagnostics.Process]$Process,
    [int]$TimeoutSeconds
  )

  if (-not $Process.WaitForExit($TimeoutSeconds * 1000)) {
    try { $Process.Kill() } catch {}
    throw "Timed out waiting for subscriber process"
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sampleCheckScript = Join-Path $repoRoot "scripts/dev/check-hardware-stable-version-gateway-command-samples.ps1"
$injectScript = Join-Path $repoRoot "scripts/dev/inject-hardware-stable-version-command.ps1"
$sampleReportFile = Join-Path $repoRoot "docs/unified/reports/hardware-stable-version-gateway-command-samples-latest.json"
$fullApiEnvFile = Join-Path $repoRoot $ApiEnvFile

Push-Location $repoRoot
try {
  powershell -NoProfile -ExecutionPolicy Bypass -File $sampleCheckScript | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "gateway command sample generation failed (exit=$LASTEXITCODE)"
  }

  $sampleReport = Read-JsonFile $sampleReportFile
  $planRaw = powershell -NoProfile -ExecutionPolicy Bypass -File $injectScript -Sample $Sample -Mode uart-plan -ChunkStrategy suggested | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "inject-hardware-stable-version-command uart-plan failed (exit=$LASTEXITCODE)"
  }
  $plan = $planRaw | ConvertFrom-Json

  $resolvedPassword = if ($Password) { $Password } else { Read-EnvValue $fullApiEnvFile "MQTT_INTERNAL_PASSWORD" }
  if (-not $resolvedPassword) {
    throw "MQTT internal password is missing. Provide -Password or configure MQTT_INTERNAL_PASSWORD in $ApiEnvFile"
  }

  $tmpDir = Join-Path $repoRoot ".tmp"
  if (-not (Test-Path $tmpDir)) {
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
  }

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stdoutFile = Join-Path $tmpDir "wait-for-command-$stamp.stdout.log"
  $stderrFile = Join-Path $tmpDir "wait-for-command-$stamp.stderr.log"

  $waitArgs = @(
    "scripts/dev/wait-for-command.js",
    "--mqtt", $MqttUrl,
    "--device", $plan.deviceId,
    "--topic", $plan.topic,
    "--commandId", $plan.commandId,
    "--timeout", $TimeoutSeconds,
    "--username", $Username,
    "--password", $resolvedPassword
  )

  $subscriber = Start-Process -FilePath "node" -ArgumentList $waitArgs -WorkingDirectory $repoRoot -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
  Start-Sleep -Milliseconds 1200

  $publishRaw = powershell -NoProfile -ExecutionPolicy Bypass -File $injectScript -Sample $Sample -Mode mqtt -MqttUrl $MqttUrl -Username $Username -Password $resolvedPassword | Out-String
  $publishExitCode = $LASTEXITCODE

  Wait-NodeProcess -Process $subscriber -TimeoutSeconds ($TimeoutSeconds + 3)
  $subscriber.Refresh()
  $subscriberExitCode = if ($subscriber.HasExited) { $subscriber.ExitCode } else { $null }

  $subscriberStdoutRaw = if (Test-Path $stdoutFile) { Get-Content -Raw -Encoding UTF8 $stdoutFile } else { "" }
  $subscriberStderrRaw = if (Test-Path $stderrFile) { Get-Content -Raw -Encoding UTF8 $stderrFile } else { "" }
  $subscriberStdout = if ($null -ne $subscriberStdoutRaw) { ([string]$subscriberStdoutRaw).Trim() } else { "" }
  $subscriberStderr = if ($null -ne $subscriberStderrRaw) { ([string]$subscriberStderrRaw).Trim() } else { "" }
  $publishResult = if ($publishRaw.Trim()) { $publishRaw | ConvertFrom-Json } else { $null }

  $receivedLine = ($subscriberStdout -split "`r?`n" | Where-Object { $_ -like "received:*" } | Select-Object -Last 1)
  $receivedPayload = $null
  if ($receivedLine) {
    $receivedPayload = ($receivedLine -replace '^received:\s*', '') | ConvertFrom-Json
  }
  $subscriberClean = $subscriber.HasExited -and (($subscriberExitCode -eq 0) -or (($null -eq $subscriberExitCode) -and $receivedPayload -and [string]::IsNullOrWhiteSpace($subscriberStderr)))

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    conclusion = "hardware-stable-version-command-sample-can-be-published-to-local-mqtt-broker-and-observed-on-cmd-topic"
    sample = $Sample
    hardwareDeviceId = $sampleReport.hardwareDeviceId
    checks = [ordered]@{
      localMqttReachable = $true
      publishCommandSucceeded = ($publishExitCode -eq 0)
      subscriberExitedCleanly = $subscriberClean
      commandObservedOnTopic = ($null -ne $receivedPayload)
      observedCommandIdMatches = ($null -ne $receivedPayload -and $receivedPayload.command_id -eq $plan.commandId)
      observedDeviceIdMatches = ($null -ne $receivedPayload -and $receivedPayload.device_id -eq $plan.deviceId)
      observedCommandTypeMatches = ($null -ne $receivedPayload -and $receivedPayload.command_type -eq $plan.commandType)
    }
    publish = $publishResult
    subscribe = [ordered]@{
      username = $Username
      exitCode = $subscriberExitCode
      topic = $plan.topic
      deviceId = $plan.deviceId
      commandId = $plan.commandId
      stdout = $subscriberStdout
      stderr = $subscriberStderr
      receivedPayload = $receivedPayload
    }
    remainingGaps = @(
      "bind the same MQTT publish proof to a real gateway subscriber instead of the wait-for-command probe",
      "capture board-side UART receive evidence after the broker publishes the command",
      "prove mismatch command publish plus board-side ignore behavior end-to-end"
    )
  }

  $json = $report | ConvertTo-Json -Depth 8
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
