$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sampleCheckScript = Join-Path $repoRoot "scripts/dev/check-hardware-stable-version-gateway-command-samples.ps1"
$injectScript = Join-Path $repoRoot "scripts/dev/inject-hardware-stable-version-command.js"
$sampleReportFile = Join-Path $repoRoot "docs/unified/reports/hardware-stable-version-gateway-command-samples-latest.json"
$outFile = Join-Path $repoRoot "docs/unified/reports/hardware-stable-version-gateway-uart-injection-readiness-latest.json"

function Read-JsonFile {
  param([string]$Path)
  return (Get-Content -Raw -Encoding UTF8 $Path | ConvertFrom-Json)
}

function Invoke-NodeJson {
  param([string[]]$NodeArgs)
  $raw = & node @NodeArgs | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "Node command failed (exit=$LASTEXITCODE): node $($NodeArgs -join ' ')"
  }
  return ($raw | ConvertFrom-Json)
}

function Test-TcpPort {
  param(
    [string]$TargetHost,
    [int]$Port,
    [int]$TimeoutMs = 1500
  )

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($TargetHost, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      $client.Close()
      return $false
    }
    $client.EndConnect($async) | Out-Null
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Get-SerialPortNamesSafe {
  $ports = @()
  $available = $false
  $warning = $null
  $method = $null

  try {
    $type = [System.Type]::GetType("System.IO.Ports.SerialPort, System.IO.Ports")
    if (-not $type) {
      $type = [System.Type]::GetType("System.IO.Ports.SerialPort")
    }
    if ($type -and $type.GetMethod("GetPortNames")) {
      $ports = $type.GetMethod("GetPortNames").Invoke($null, @())
      $available = $true
      $method = "system.io.ports"
    } else {
      $cimPorts = @(Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | ForEach-Object { $_.DeviceID })
      if ($cimPorts.Count -gt 0) {
        $ports = $cimPorts
        $available = $true
        $method = "win32_serialport"
        $warning = "Fell back to Win32_SerialPort because System.IO.Ports.SerialPort is unavailable"
      } else {
        $pnpPorts = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match '\(COM\d+\)' } | ForEach-Object {
          if ($_.FriendlyName -match '\((COM\d+)\)') { $matches[1] }
        } | Where-Object { $_ })
        $available = $true
        $ports = $pnpPorts
        $method = "pnpdevice"
        if ($pnpPorts.Count -eq 0) {
          $warning = "System.IO.Ports.SerialPort is unavailable; no COM ports were found via Win32_SerialPort or PnP enumeration"
        } else {
          $warning = "Fell back to PnP device enumeration because System.IO.Ports.SerialPort is unavailable"
        }
      }
    }
  } catch {
    $available = $false
    $warning = $_.Exception.Message
  }

  return [ordered]@{
    available = $available
    method = $method
    ports = @($ports | Sort-Object)
    warning = $warning
  }
}

Push-Location $repoRoot
try {
  powershell -NoProfile -ExecutionPolicy Bypass -File $sampleCheckScript | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "gateway command sample generation failed (exit=$LASTEXITCODE)"
  }

  $sampleReport = Read-JsonFile $sampleReportFile
  $sampleNames = @()
  foreach ($sample in $sampleReport.alignedSamples) {
    $sampleNames += [string]$sample.commandType
  }
  $sampleNames += "mismatch"

  $uartPlans = @()
  foreach ($sampleName in $sampleNames) {
    $suggestedPlan = Invoke-NodeJson -NodeArgs @(
      "scripts/dev/inject-hardware-stable-version-command.js",
      "--sample", $sampleName,
      "--mode", "uart-plan",
      "--chunkStrategy", "suggested"
    )
    $wholePlan = Invoke-NodeJson -NodeArgs @(
      "scripts/dev/inject-hardware-stable-version-command.js",
      "--sample", $sampleName,
      "--mode", "uart-plan",
      "--chunkStrategy", "whole"
    )

    $uartPlans += [ordered]@{
      sample = $sampleName
      sampleKind = $suggestedPlan.sampleKind
      commandType = $suggestedPlan.commandType
      commandId = $suggestedPlan.commandId
      deviceId = $suggestedPlan.deviceId
      topic = $suggestedPlan.topic
      payloadBytes = $suggestedPlan.payloadBytes
      suggestedChunkCount = $suggestedPlan.chunkCount
      wholeChunkCount = $wholePlan.chunkCount
      samplePath = $suggestedPlan.samplePath
      recommendedCommands = [ordered]@{
        uartPlanSuggested = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/inject-hardware-stable-version-command.ps1 -Sample $sampleName -Mode uart-plan -ChunkStrategy suggested"
        uartComSuggested = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/inject-hardware-stable-version-command.ps1 -Sample $sampleName -Mode uart-com -Port <COMx> -ChunkStrategy suggested -InterChunkDelayMs 50"
        uartComWhole = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/inject-hardware-stable-version-command.ps1 -Sample $sampleName -Mode uart-com -Port <COMx> -ChunkStrategy whole"
        mqtt = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/inject-hardware-stable-version-command.ps1 -Sample $sampleName -Mode mqtt -MqttUrl mqtt://127.0.0.1:1883"
      }
    }
  }

  $serialProbe = Get-SerialPortNamesSafe
  $serialPorts = @($serialProbe.ports)
  $mqttListening = Test-TcpPort -TargetHost "127.0.0.1" -Port 1883

  $remainingGaps = @(
    "execute one aligned sample over a real MQTT broker on cmd/{device_id}",
    "execute one aligned sample over a real COM/UART path to the gateway or board",
    "capture board-side evidence that the mismatch sample is ignored end-to-end"
  )
  if (-not $mqttListening) {
    $remainingGaps += "local mqtt://127.0.0.1:1883 is not listening in the current environment"
  }
  if (-not $serialProbe.available) {
    $remainingGaps += "current PowerShell runtime cannot enumerate COM ports through System.IO.Ports"
  } elseif ($serialPorts.Count -eq 0) {
    $remainingGaps += "no Windows COM port is currently visible to this host session"
  }

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    conclusion = "hardware-stable-version-gateway-uart-injection-entrypoints-are-scripted-and-ready-for-field-execution"
    hardwareDeviceId = $sampleReport.hardwareDeviceId
    commandTopic = $sampleReport.commandTopic
    checks = [ordered]@{
      sampleReportPresent = $true
      uartInjectionScriptPresent = (Test-Path $injectScript)
      allPrimaryCommandSamplesPlanned = ($uartPlans.Count -ge 11)
      localMqtt1883Listening = $mqttListening
      serialPortProbeAvailable = $serialProbe.available
      serialPortsVisible = ($serialPorts.Count -gt 0)
    }
    environment = [ordered]@{
      mqtt = [ordered]@{
        endpoint = "mqtt://127.0.0.1:1883"
        listening = $mqttListening
      }
      serial = [ordered]@{
        probeAvailable = $serialProbe.available
        method = $serialProbe.method
        warning = $serialProbe.warning
        ports = @($serialPorts)
      }
    }
    plannedSamples = $uartPlans
    remainingGaps = $remainingGaps
  }

  $json = $report | ConvertTo-Json -Depth 8
  Set-Content -Path $outFile -Value $json -Encoding UTF8
  $json
} finally {
  Pop-Location
}
