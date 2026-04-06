param(
  [string]$Sample = "manual_collect",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [int]$TimeoutSeconds = 15,
  [string]$ApiEnvFile = "services/api/.env",
  [string]$OutFile = "docs/unified/reports/hardware-stable-version-mqtt-to-uart-relay-proof-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

function Read-JsonFile {
  param([string]$Path)
  return (Get-Content -Raw -Encoding UTF8 $Path | ConvertFrom-Json)
}

function Invoke-PowerShellJson {
  param([string[]]$PsArgs)
  $raw = powershell -NoProfile -ExecutionPolicy Bypass @PsArgs | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "PowerShell command failed (exit=$LASTEXITCODE): powershell $($PsArgs -join ' ')"
  }
  return ($raw | ConvertFrom-Json)
}

function Wait-NodeProcess {
  param(
    [System.Diagnostics.Process]$Process,
    [int]$TimeoutSeconds
  )

  if (-not $Process.WaitForExit($TimeoutSeconds * 1000)) {
    try { $Process.Kill() } catch {}
    throw "Timed out waiting for relay process"
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$injectScript = Join-Path $repoRoot "scripts/dev/inject-hardware-stable-version-command.ps1"
$sampleReportFile = Join-Path $repoRoot "docs/unified/reports/hardware-stable-version-gateway-command-samples-latest.json"
$fullApiEnvFile = Join-Path $repoRoot $ApiEnvFile

Push-Location $repoRoot
try {
  $mqttPassword = Read-EnvValue $fullApiEnvFile "MQTT_INTERNAL_PASSWORD"
  if (-not $mqttPassword) {
    throw "MQTT_INTERNAL_PASSWORD is missing in $ApiEnvFile"
  }

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $relayStdout = ".tmp\mqtt-uart-relay-proof-$stamp.stdout.log"
  $relayStderr = ".tmp\mqtt-uart-relay-proof-$stamp.stderr.log"
  $relayOutFile = ".tmp\mqtt-uart-relay-proof-$stamp.result.json"

  if (-not (Test-Path ".tmp")) {
    New-Item -ItemType Directory -Path ".tmp" -Force | Out-Null
  }

  $sampleReport = Read-JsonFile $sampleReportFile
  $plan = Invoke-PowerShellJson -PsArgs @(
    "-File", $injectScript,
    "-Sample", $Sample,
    "-Mode", "uart-plan",
    "-ChunkStrategy", "suggested"
  )

  $relay = Start-Process -FilePath "node" -ArgumentList @(
    "scripts/dev/relay-hardware-stable-version-command-to-uart.js",
    "--mqtt", $MqttUrl,
    "--topic", $plan.topic,
    "--username", "ingest-service",
    "--password", $mqttPassword,
    "--sink", "file",
    "--outFile", $relayOutFile,
    "--timeout", $TimeoutSeconds,
    "--chunkStrategy", "suggested"
  ) -WorkingDirectory $repoRoot -RedirectStandardOutput $relayStdout -RedirectStandardError $relayStderr -PassThru

  Start-Sleep -Milliseconds 1500

  $publishRaw = powershell -NoProfile -ExecutionPolicy Bypass -File $injectScript -Sample $Sample -Mode mqtt -MqttUrl $MqttUrl -Username ingest-service -Password $mqttPassword | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "inject-hardware-stable-version-command mqtt failed (exit=$LASTEXITCODE)"
  }

  Wait-NodeProcess -Process $relay -TimeoutSeconds ($TimeoutSeconds + 3)
  $relay.Refresh()

  $relayReport = Read-JsonFile (Join-Path $repoRoot $relayOutFile)
  $publishRawText = if ($null -ne $publishRaw) { [string]$publishRaw } else { "" }
  $publish = if ($publishRawText.Trim()) { $publishRawText | ConvertFrom-Json } else { $null }
  $relayStdoutText = if (Test-Path $relayStdout) { [string](Get-Content -Raw -Encoding UTF8 $relayStdout) } else { "" }
  $relayStderrText = if (Test-Path $relayStderr) { [string](Get-Content -Raw -Encoding UTF8 $relayStderr) } else { "" }

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    conclusion = "hardware-stable-version-command-can-flow-from-local-mqtt-broker-into-gateway-style-uart-relay-plan"
    sample = $Sample
    hardwareDeviceId = $sampleReport.hardwareDeviceId
    sampleTopic = $plan.topic
    checks = [ordered]@{
      publishCommandSucceeded = ($publish -ne $null)
      relayExited = $relay.HasExited
      relayReceivedCommand = ($relayReport.command.commandId -eq $publish.commandId)
      relayTopicMatches = ($relayReport.topic -eq $publish.topic)
      relayCommandTypeMatches = ($relayReport.command.commandType -eq $publish.commandType)
      relayGeneratedChunks = (($relayReport.plan.chunkCount -as [int]) -gt 0)
      relayUsedSuggestedChunking = ($relayReport.plan.chunkStrategy -eq "suggested")
    }
    publish = $publish
    relay = [ordered]@{
      stdout = ([string]$relayStdoutText).Trim()
      stderr = ([string]$relayStderrText).Trim()
      report = $relayReport
    }
    remainingGaps = @(
      "switch relay sink from file to uart-com when a real COM port becomes visible",
      "capture board-side receive evidence after relay writes the UART chunks",
      "prove mismatch command publish plus board-side ignore behavior through the same relay path"
    )
  }

  $json = $report | ConvertTo-Json -Depth 9
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
