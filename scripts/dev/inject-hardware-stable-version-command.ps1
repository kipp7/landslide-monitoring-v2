[CmdletBinding()]
param(
  [string]$Sample = "",
  [ValidateSet("mqtt", "uart-plan", "uart-com")]
  [string]$Mode = "uart-plan",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Topic = "",
  [string]$Username = "",
  [string]$Password = "",
  [ValidateSet("suggested", "whole", "fixed")]
  [string]$ChunkStrategy = "suggested",
  [int]$ChunkSize = 0,
  [ValidateSet("none", "ack", "ok")]
  [string]$AckPrefix = "none",
  [int]$InterChunkDelayMs = 0,
  [string]$PayloadFile = "",
  [string]$PayloadLabel = "",
  [string]$Port = "",
  [int]$BaudRate = 115200,
  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-SerialPortType {
  try {
    return [System.IO.Ports.SerialPort]
  } catch {
  }

  try {
    Add-Type -AssemblyName "System.IO.Ports" -ErrorAction Stop
    return [System.IO.Ports.SerialPort]
  } catch {
  }

  $type = [System.Type]::GetType("System.IO.Ports.SerialPort, System.IO.Ports")
  if (-not $type) {
    $type = [System.Type]::GetType("System.IO.Ports.SerialPort")
  }
  return $type
}

function Send-ChunksViaFileStream {
  param(
    [string]$Port,
    [int]$BaudRate,
    [object[]]$Chunks,
    [int]$InterChunkDelayMs
  )

  $modeOutput = cmd /c "mode $Port BAUD=$BaudRate PARITY=n DATA=8 STOP=1" 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure $Port with mode: $($modeOutput.Trim())"
  }

  $devicePath = "\\.\$Port"
  $stream = [System.IO.File]::Open($devicePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try {
    foreach ($chunk in $Chunks) {
      $bytes = [System.Text.Encoding]::UTF8.GetBytes([string]$chunk)
      $stream.Write($bytes, 0, $bytes.Length)
      $stream.Flush()
      if ($InterChunkDelayMs -gt 0) {
        Start-Sleep -Milliseconds $InterChunkDelayMs
      }
    }
  } finally {
    $stream.Dispose()
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $commonArgs = @(
    "scripts/dev/inject-hardware-stable-version-command.js",
    "--chunkStrategy", $ChunkStrategy,
    "--ackPrefix", $AckPrefix,
    "--interChunkDelayMs", $InterChunkDelayMs
  )
  if ($PayloadFile) {
    $commonArgs += @("--payloadFile", $PayloadFile)
    if ($PayloadLabel) { $commonArgs += @("--payloadLabel", $PayloadLabel) }
  } elseif ($Sample) {
    $commonArgs += @("--sample", $Sample)
  } else {
    throw "Either -Sample or -PayloadFile is required"
  }
  if ($ChunkStrategy -eq "fixed" -and $ChunkSize -gt 0) {
    $commonArgs += @("--chunkSize", $ChunkSize)
  }
  if ($Topic) {
    $commonArgs += @("--topic", $Topic)
  }

  if ($Mode -eq "mqtt") {
    $args = @($commonArgs + @("--mode", "mqtt", "--mqtt", $MqttUrl))
    if ($Username) { $args += @("--username", $Username) }
    if ($Password) { $args += @("--password", $Password) }

    & node @args
    if ($LASTEXITCODE -ne 0) {
      throw "inject-hardware-stable-version-command mqtt failed (exit=$LASTEXITCODE)"
    }
    return
  }

  $planArgs = @($commonArgs + @("--mode", "uart-plan"))
  $planRaw = & node @planArgs | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "inject-hardware-stable-version-command uart-plan failed (exit=$LASTEXITCODE)"
  }

  $plan = $planRaw | ConvertFrom-Json
  if (-not $plan -or -not $plan.chunks) {
    throw "Failed to parse UART injection plan"
  }

  if ($Mode -eq "uart-plan") {
    if ($OutFile) {
      Set-Content -Path $OutFile -Value $planRaw.Trim() -Encoding UTF8
    }
    $planRaw.Trim()
    return
  }

  if (-not $Port) {
    throw "uart-com mode requires -Port"
  }

  $serialPortType = Get-SerialPortType
  $writeMethod = "mode+filestream"
  if ($serialPortType) {
    $writeMethod = "system.io.ports"
    $serial = New-Object System.IO.Ports.SerialPort $Port, $BaudRate, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
    $serial.Encoding = [System.Text.Encoding]::UTF8
    $serial.ReadTimeout = 1000
    $serial.WriteTimeout = 5000

    try {
      $serial.Open()
      foreach ($chunk in $plan.chunks) {
        $serial.Write($chunk)
        if ($InterChunkDelayMs -gt 0) {
          Start-Sleep -Milliseconds $InterChunkDelayMs
        }
      }
    } finally {
      if ($serial.IsOpen) {
        $serial.Close()
      }
      $serial.Dispose()
    }
  } else {
    Send-ChunksViaFileStream -Port $Port -BaudRate $BaudRate -Chunks $plan.chunks -InterChunkDelayMs $InterChunkDelayMs
  }

  $result = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    mode = "uart-com"
    sample = if ($Sample) { $Sample } else { $plan.sample }
    port = $Port
    baudRate = $BaudRate
    writeMethod = $writeMethod
    chunkStrategy = $plan.chunkStrategy
    chunkCount = $plan.chunkCount
    payloadBytes = $plan.payloadBytes
    interChunkDelayMs = $InterChunkDelayMs
    ackPrefix = $AckPrefix
    topic = $plan.topic
    commandType = $plan.commandType
    commandId = $plan.commandId
    deviceId = $plan.deviceId
  }

  $resultJson = $result | ConvertTo-Json -Depth 5
  if ($OutFile) {
    Set-Content -Path $OutFile -Value $resultJson -Encoding UTF8
  }
  $resultJson
} finally {
  Pop-Location
}
