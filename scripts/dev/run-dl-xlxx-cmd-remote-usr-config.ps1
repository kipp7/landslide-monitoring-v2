[CmdletBinding()]
param(
  [ValidateSet("set-baud-115200", "set-baud-9600")]
  [string]$Action = "set-baud-115200",
  [string]$Port,
  [string]$RemoteAddress = "0003",
  [int]$BaudRate = 115200,
  [int]$ReadAfterWriteSeconds = 3,
  [int]$SourcePort = 16,
  [int]$ReadPollMs = 100
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Convert-HexAddressToUInt16 {
  param([string]$Value)

  $normalized = $Value.Trim().ToUpperInvariant()
  if ($normalized.StartsWith("0X")) {
    $normalized = $normalized.Substring(2)
  }
  if ($normalized.Length -gt 4) {
    throw "RemoteAddress must fit in 16 bits"
  }
  return [Convert]::ToUInt16($normalized, 16)
}

function Get-Crc8 {
  param([byte[]]$Bytes)

  $crc = 0xFF
  foreach ($b in $Bytes) {
    $crc = $crc -bxor $b
    for ($i = 0; $i -lt 8; $i++) {
      if (($crc -band 0x80) -ne 0) {
        $crc = (($crc -shl 1) -bxor 0x31) -band 0xFF
      } else {
        $crc = ($crc -shl 1) -band 0xFF
      }
    }
  }
  return [byte]$crc
}

function Escape-Cc9d {
  param([byte[]]$Bytes)

  $escaped = New-Object System.Collections.Generic.List[byte]
  foreach ($b in $Bytes) {
    switch ($b) {
      0x9D {
        $escaped.Add(0x9E)
        $escaped.Add(0xFE)
      }
      0x9E {
        $escaped.Add(0x9E)
        $escaped.Add(0xFF)
      }
      default {
        $escaped.Add($b)
      }
    }
  }
  return $escaped.ToArray()
}

function Unescape-Cc9d {
  param([byte[]]$Bytes)

  $decoded = New-Object System.Collections.Generic.List[byte]
  for ($i = 0; $i -lt $Bytes.Length; $i++) {
    $b = $Bytes[$i]
    if ($b -eq 0x9E) {
      if ($i + 1 -ge $Bytes.Length) {
        throw "Dangling CC9D escape byte"
      }

      $next = $Bytes[$i + 1]
      switch ($next) {
        0xFE { $decoded.Add(0x9D) }
        0xFF { $decoded.Add(0x9E) }
        default { throw ("Invalid CC9D escape sequence 0x9E 0x{0}" -f $next.ToString("X2")) }
      }
      $i++
      continue
    }

    $decoded.Add($b)
  }

  return $decoded.ToArray()
}

function Convert-BytesToHex {
  param([byte[]]$Bytes)
  if ($null -eq $Bytes -or $Bytes.Length -eq 0) {
    return ""
  }
  return (($Bytes | ForEach-Object { $_.ToString("X2") }) -join " ")
}

function Build-Cc9dFrame {
  param(
    [int]$SessionSourcePort,
    [int]$SessionDestinationPort,
    [UInt16]$SessionRemoteAddress,
    [byte[]]$PayloadBytes
  )

  $session = New-Object System.Collections.Generic.List[byte]
  $session.Add([byte]$SessionSourcePort)
  $session.Add([byte]$SessionDestinationPort)
  $session.Add([byte]($SessionRemoteAddress -band 0xFF))
  $session.Add([byte](($SessionRemoteAddress -shr 8) -band 0xFF))
  foreach ($b in $PayloadBytes) {
    $session.Add($b)
  }

  $crc = Get-Crc8 -Bytes $session.ToArray()
  $session.Add($crc)

  $escaped = Escape-Cc9d -Bytes $session.ToArray()
  $frame = New-Object System.Collections.Generic.List[byte]
  $frame.Add(0x9D)
  foreach ($b in $escaped) {
    $frame.Add($b)
  }
  $frame.Add(0x9D)

  return [ordered]@{
    session = $session.ToArray()
    crc = $crc
    frame = $frame.ToArray()
  }
}

function Try-DecodeCc9dPacket {
  param([byte[]]$PacketBytes)

  try {
    $decoded = Unescape-Cc9d -Bytes $PacketBytes
    if ($decoded.Length -lt 5) {
      return [ordered]@{
        ok = $false
        reason = "packet_too_short"
        rawHex = Convert-BytesToHex -Bytes $PacketBytes
      }
    }

    $payloadWithoutCrc = [byte[]]$decoded[0..($decoded.Length - 2)]
    $receivedCrc = $decoded[$decoded.Length - 1]
    $computedCrc = Get-Crc8 -Bytes $payloadWithoutCrc
    $payload = if ($decoded.Length -gt 5) { [byte[]]$decoded[4..($decoded.Length - 2)] } else { [byte[]]@() }

    return [ordered]@{
      ok = ($computedCrc -eq $receivedCrc)
      sourcePort = [int]$decoded[0]
      destinationPort = [int]$decoded[1]
      remoteAddress = ("0x{0}" -f ((([int]$decoded[3] -shl 8) + [int]$decoded[2]).ToString("X4")))
      payloadLength = $payload.Length
      payloadHex = Convert-BytesToHex -Bytes $payload
      payloadAscii = [System.Text.Encoding]::ASCII.GetString($payload)
      decodedHex = Convert-BytesToHex -Bytes $decoded
      computedCrc = ("0x{0}" -f $computedCrc.ToString("X2"))
      receivedCrc = ("0x{0}" -f $receivedCrc.ToString("X2"))
    }
  } catch {
    return [ordered]@{
      ok = $false
      reason = $_.Exception.Message
      rawHex = Convert-BytesToHex -Bytes $PacketBytes
    }
  }
}

function Read-Cc9dFrames {
  param(
    [System.IO.Ports.SerialPort]$SerialPort,
    [int]$Seconds,
    [int]$PollMs
  )

  $deadline = (Get-Date).AddSeconds($Seconds)
  $effectivePollMs = if ($PollMs -gt 0) { $PollMs } else { 100 }
  $rawBytes = New-Object System.Collections.Generic.List[byte]
  $currentPacket = New-Object System.Collections.Generic.List[byte]
  $frames = New-Object System.Collections.Generic.List[object]
  $inFrame = $false

  while ((Get-Date) -lt $deadline) {
    while ($SerialPort.BytesToRead -gt 0) {
      $byteValue = $SerialPort.ReadByte()
      if ($byteValue -lt 0) {
        break
      }

      $b = [byte]$byteValue
      $rawBytes.Add($b)

      if ($b -eq 0x9D) {
        if ($inFrame -and $currentPacket.Count -gt 0) {
          $frames.Add((Try-DecodeCc9dPacket -PacketBytes ([byte[]]$currentPacket.ToArray()))) | Out-Null
        }

        $currentPacket.Clear()
        $inFrame = $true
        continue
      }

      if ($inFrame) {
        $currentPacket.Add($b)
      }
    }

    Start-Sleep -Milliseconds $effectivePollMs
  }

  $rawPreviewBytes = [byte[]]$rawBytes.ToArray()
  if ($rawPreviewBytes.Length -gt 128) {
    $rawPreviewBytes = $rawPreviewBytes[0..127]
  }

  return [ordered]@{
    seconds = $Seconds
    pollMs = $effectivePollMs
    rawBytes = $rawBytes.Count
    rawHexPreview = Convert-BytesToHex -Bytes $rawPreviewBytes
    frameCount = $frames.Count
    frames = @($frames.ToArray())
  }
}

if (-not $Port) {
  throw "-Port is required and must be the center-node XL01 CMD port"
}

$baudCode = switch ($Action) {
  "set-baud-115200" { 0x08 }
  "set-baud-9600" { 0x03 }
  default { throw "Unsupported action: $Action" }
}

$destinationPort = 101
$payloadBytes = [byte[]](0x42, [byte]$baudCode)
$remoteUInt16 = Convert-HexAddressToUInt16 -Value $RemoteAddress
$frameInfo = Build-Cc9dFrame -SessionSourcePort $SourcePort -SessionDestinationPort $destinationPort -SessionRemoteAddress $remoteUInt16 -PayloadBytes $payloadBytes

$serial = New-Object System.IO.Ports.SerialPort $Port, $BaudRate, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
$serial.Handshake = [System.IO.Ports.Handshake]::None
$serial.DtrEnable = $false
$serial.RtsEnable = $false
$serial.ReadTimeout = 500
$serial.WriteTimeout = 5000

$capture = $null
try {
  $serial.Open()
  $serial.DiscardInBuffer()
  $serial.DiscardOutBuffer()
  $frameBytes = $frameInfo.frame
  $serial.Write($frameBytes, 0, $frameBytes.Length)
  $capture = Read-Cc9dFrames -SerialPort $serial -Seconds $ReadAfterWriteSeconds -PollMs $ReadPollMs
} finally {
  if ($serial.IsOpen) {
    $serial.Close()
  }
  $serial.Dispose()
}

[ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  mode = "live"
  action = $Action
  port = $Port
  baudRate = $BaudRate
  remoteAddress = ("0x{0}" -f $remoteUInt16.ToString("X4"))
  sourcePort = $SourcePort
  destinationPort = $destinationPort
  payloadHex = Convert-BytesToHex -Bytes $payloadBytes
  expectedMeaning = if ($Action -eq "set-baud-115200") { "USR baud -> 115200 (code 0x08)" } else { "USR baud -> 9600 (code 0x03)" }
  crc8 = ("0x{0}" -f $frameInfo.crc.ToString("X2"))
  frameBytes = $frameInfo.frame.Length
  frameHex = Convert-BytesToHex -Bytes $frameInfo.frame
  capture = $capture
} | ConvertTo-Json -Depth 8
