[CmdletBinding()]
param(
  [string]$Sample = "",
  [ValidateSet("mqtt", "uart-plan", "uart-com")]
  [string]$Mode = "uart-plan",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Topic = "",
  [string]$Username = "",
  [string]$Password = "",
  [string]$ApiEnvFile = "services/api/.env",
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
  [int]$ReadAfterWriteSeconds = 0,
  [int]$ReadPollMs = 100,
  [int]$PostWriteDelayMs = 150,
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

function Read-AfterWrite {
  param(
    [System.IO.Ports.SerialPort]$SerialPort,
    [int]$Seconds,
    [int]$PollMs
  )

  $builder = New-Object System.Text.StringBuilder
  $deadline = (Get-Date).AddSeconds($Seconds)
  $effectivePollMs = if ($PollMs -gt 0) { $PollMs } else { 100 }

  while ((Get-Date) -lt $deadline) {
    try {
      $text = $SerialPort.ReadExisting()
      if ($text) {
        [void]$builder.Append($text)
      }
    } catch {
    }
    Start-Sleep -Milliseconds $effectivePollMs
  }

  $capturedText = $builder.ToString()
  return [ordered]@{
    seconds = $Seconds
    pollMs = $effectivePollMs
    bytes = [System.Text.Encoding]::UTF8.GetByteCount($capturedText)
    lineCount = @(($capturedText -split "`r?`n") | Where-Object { $_ -ne "" }).Count
    text = $capturedText
  }
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
    $resolvedUsername = if ($Username) { $Username } else { "ingest-service" }
    $resolvedPassword = if ($Password) { $Password } else { Read-EnvValue -Path (Join-Path $repoRoot $ApiEnvFile) -Key "MQTT_INTERNAL_PASSWORD" }
    $args = @($commonArgs + @("--mode", "mqtt", "--mqtt", $MqttUrl))
    if ($resolvedUsername) { $args += @("--username", $resolvedUsername) }
    if ($resolvedPassword) { $args += @("--password", $resolvedPassword) }

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
  $capture = $null
  if ($serialPortType) {
    $writeMethod = "system.io.ports"
    $serial = New-Object System.IO.Ports.SerialPort $Port, $BaudRate, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
    $serial.Encoding = [System.Text.Encoding]::UTF8
    $serial.Handshake = [System.IO.Ports.Handshake]::None
    $serial.DtrEnable = $false
    $serial.RtsEnable = $false
    $serial.ReadTimeout = 1000
    $serial.WriteTimeout = 5000

    try {
      $serial.Open()
      $serial.DiscardInBuffer()
      $serial.DiscardOutBuffer()
      foreach ($chunk in $plan.chunks) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes([string]$chunk)
        $serial.Write($bytes, 0, $bytes.Length)
        if ($InterChunkDelayMs -gt 0) {
          Start-Sleep -Milliseconds $InterChunkDelayMs
        }
      }

      if ($PostWriteDelayMs -gt 0) {
        Start-Sleep -Milliseconds $PostWriteDelayMs
      }

      if ($ReadAfterWriteSeconds -gt 0) {
        $capture = Read-AfterWrite -SerialPort $serial -Seconds $ReadAfterWriteSeconds -PollMs $ReadPollMs
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
    chunkSize = $plan.chunkSize
    chunkCount = $plan.chunkCount
    payloadBytes = $plan.payloadBytes
    interChunkDelayMs = $InterChunkDelayMs
    postWriteDelayMs = $PostWriteDelayMs
    ackPrefix = $AckPrefix
    readAfterWriteSeconds = if ($ReadAfterWriteSeconds -gt 0) { $ReadAfterWriteSeconds } else { $null }
    topic = $plan.topic
    commandType = $plan.commandType
    commandId = $plan.commandId
    deviceId = $plan.deviceId
    capture = $capture
  }

  $resultJson = $result | ConvertTo-Json -Depth 5
  if ($OutFile) {
    Set-Content -Path $OutFile -Value $resultJson -Encoding UTF8
  }
  $resultJson
} finally {
  Pop-Location
}
