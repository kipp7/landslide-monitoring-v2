param(
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Topic = "",
  [string]$DeviceId = "",
  [string]$ApiEnvFile = "services/api/.env",
  [ValidateSet("file", "stdout", "uart-com")]
  [string]$Sink = "file",
  [ValidateSet("suggested", "whole", "fixed")]
  [string]$ChunkStrategy = "suggested",
  [int]$InterChunkDelayMs = 50,
  [int]$ReadAfterWriteSeconds = 0,
  [int]$BaudRate = 115200,
  [string]$Port = "",
  [int]$WaitForPortSeconds = 0,
  [int]$TimeoutSeconds = 0,
  [string]$OutFile = ".tmp/hardware-stable-version-mqtt-uart-relay-live.json",
  [switch]$RunInBackground,
  [switch]$DryRun
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

function Get-SerialPortProbe {
  $ports = @()
  $method = $null
  $warning = $null

  try {
    $type = [System.Type]::GetType("System.IO.Ports.SerialPort, System.IO.Ports")
    if (-not $type) {
      $type = [System.Type]::GetType("System.IO.Ports.SerialPort")
    }
    if ($type -and $type.GetMethod("GetPortNames")) {
      $ports = @($type.GetMethod("GetPortNames").Invoke($null, @()) | Sort-Object)
      $method = "system.io.ports"
    } else {
      $cimPorts = @(Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | ForEach-Object { $_.DeviceID })
      if ($cimPorts.Count -gt 0) {
        $ports = @($cimPorts | Sort-Object)
        $method = "win32_serialport"
        $warning = "Fell back to Win32_SerialPort because System.IO.Ports.SerialPort is unavailable"
      } else {
        $pnpPorts = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match '\(COM\d+\)' } | ForEach-Object {
          if ($_.FriendlyName -match '\((COM\d+)\)') { $matches[1] }
        } | Where-Object { $_ })
        $ports = @($pnpPorts | Sort-Object)
        $method = "pnpdevice"
        if ($ports.Count -eq 0) {
          $warning = "No COM ports were found via System.IO.Ports, Win32_SerialPort, or PnP enumeration"
        } else {
          $warning = "Fell back to PnP device enumeration because System.IO.Ports.SerialPort is unavailable"
        }
      }
    }
  } catch {
    $warning = $_.Exception.Message
  }

  return [ordered]@{
    method = $method
    warning = $warning
    ports = $ports
  }
}

function Resolve-RelayPort {
  param(
    [string]$RequestedPort,
    [int]$WaitForSeconds
  )

  if ($RequestedPort -and $RequestedPort -ne "auto") {
    return [ordered]@{
      port = $RequestedPort
      autoSelected = $false
      probe = $null
    }
  }

  $deadline = if ($WaitForSeconds -gt 0) { (Get-Date).AddSeconds($WaitForSeconds) } else { Get-Date }
  do {
    $probe = Get-SerialPortProbe
    if (@($probe.ports).Count -gt 0) {
      return [ordered]@{
        port = @($probe.ports)[0]
        autoSelected = $true
        probe = $probe
      }
    }
    if ($WaitForSeconds -gt 0) {
      Start-Sleep -Seconds 1
    }
  } while ($WaitForSeconds -gt 0 -and (Get-Date) -lt $deadline)

  $suffix = if ($WaitForSeconds -gt 0) { " within ${WaitForSeconds}s" } else { "" }
  throw ("No visible COM port found" + $suffix)
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sampleReportFile = Join-Path $repoRoot "docs/unified/reports/hardware-stable-version-gateway-command-samples-latest.json"
$fullApiEnvFile = Join-Path $repoRoot $ApiEnvFile

Push-Location $repoRoot
try {
  $sampleReport = Read-JsonFile $sampleReportFile
  $resolvedDeviceId = if ($DeviceId) { $DeviceId } else { [string]$sampleReport.hardwareDeviceId }
  $resolvedTopic = if ($Topic) { $Topic } else { "cmd/$resolvedDeviceId" }
  $mqttPassword = Read-EnvValue $fullApiEnvFile "MQTT_INTERNAL_PASSWORD"
  if (-not $mqttPassword) {
    throw "MQTT_INTERNAL_PASSWORD is missing in $ApiEnvFile"
  }

  $resolvedPort = $Port
  $portResolution = $null
  if ($Sink -eq "uart-com") {
    $portResolution = Resolve-RelayPort -RequestedPort $Port -WaitForSeconds $WaitForPortSeconds
    $resolvedPort = [string]$portResolution.port
  }

  $nodeArgs = @(
    "scripts/dev/relay-hardware-stable-version-command-to-uart.js",
    "--mqtt", $MqttUrl,
    "--topic", $resolvedTopic,
    "--username", "ingest-service",
    "--password", $mqttPassword,
    "--sink", $Sink,
    "--outFile", $OutFile,
    "--chunkStrategy", $ChunkStrategy,
    "--interChunkDelayMs", $InterChunkDelayMs
  )

  if ($TimeoutSeconds -gt 0) {
    $nodeArgs += @("--timeout", $TimeoutSeconds)
  }
  if ($Sink -eq "uart-com") {
    $nodeArgs += @("--port", $resolvedPort, "--baudRate", $BaudRate)
    if ($ReadAfterWriteSeconds -gt 0) {
      $nodeArgs += @("--readAfterWriteSeconds", $ReadAfterWriteSeconds)
    }
  }

  $plan = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    mqttUrl = $MqttUrl
    topic = $resolvedTopic
    deviceId = $resolvedDeviceId
    username = "ingest-service"
    sink = $Sink
    chunkStrategy = $ChunkStrategy
    interChunkDelayMs = $InterChunkDelayMs
    readAfterWriteSeconds = if ($Sink -eq "uart-com" -and $ReadAfterWriteSeconds -gt 0) { $ReadAfterWriteSeconds } else { $null }
    baudRate = if ($Sink -eq "uart-com") { $BaudRate } else { $null }
    port = if ($Sink -eq "uart-com") { $resolvedPort } else { $null }
    autoPort = if ($Sink -eq "uart-com" -and $portResolution) { $portResolution.autoSelected } else { $null }
    portProbe = if ($Sink -eq "uart-com" -and $portResolution) { $portResolution.probe } else { $null }
    outFile = $OutFile
    timeoutSeconds = if ($TimeoutSeconds -gt 0) { $TimeoutSeconds } else { $null }
    waitForPortSeconds = if ($Sink -eq "uart-com" -and $WaitForPortSeconds -gt 0) { $WaitForPortSeconds } else { $null }
    command = @("node") + $nodeArgs
  }

  if ($DryRun) {
    $plan | ConvertTo-Json -Depth 6
    return
  }

  if ($RunInBackground) {
    if (-not (Test-Path ".tmp")) {
      New-Item -ItemType Directory -Path ".tmp" -Force | Out-Null
    }
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $stdout = ".tmp\hardware-stable-version-mqtt-uart-relay-$stamp.stdout.log"
    $stderr = ".tmp\hardware-stable-version-mqtt-uart-relay-$stamp.stderr.log"
    $metaFile = ".tmp\hardware-stable-version-mqtt-uart-relay-latest.json"
    $proc = Start-Process -FilePath "node" -ArgumentList $nodeArgs -WorkingDirectory $repoRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

    $meta = [ordered]@{
      generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
      mode = "background"
      processId = $proc.Id
      topic = $resolvedTopic
      deviceId = $resolvedDeviceId
      sink = $Sink
      chunkStrategy = $ChunkStrategy
      port = if ($Sink -eq "uart-com") { $resolvedPort } else { $null }
      stdout = $stdout
      stderr = $stderr
      outFile = $OutFile
      metaFile = $metaFile
    }
    Set-Content -Path $metaFile -Value ($meta | ConvertTo-Json -Depth 5) -Encoding UTF8
    Write-Output ($meta | ConvertTo-Json -Depth 5)
    return
  }

  & node @nodeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "relay-hardware-stable-version-command-to-uart failed (exit=$LASTEXITCODE)"
  }
} finally {
  Pop-Location
}
