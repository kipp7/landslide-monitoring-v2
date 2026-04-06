[CmdletBinding()]
param(
  [string]$Port,
  [int]$BaudRate = 115200,
  [string]$RemoteAddress = "0003",
  [int]$SourcePort = 16,
  [int]$DestinationPort = 112,
  [string]$PayloadFile = "",
  [string]$Text = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Convert-HexAddressToBytes {
  param([string]$Value)

  $normalized = $Value.Trim().ToUpperInvariant()
  if ($normalized.StartsWith("0X")) {
    $normalized = $normalized.Substring(2)
  }

  if ($normalized.Length -gt 4) {
    throw "RemoteAddress must fit in 16 bits"
  }

  $address = [Convert]::ToUInt16($normalized, 16)
  return @(
    [byte]($address -band 0xFF),
    [byte](($address -shr 8) -band 0xFF)
  )
}

function Get-PayloadBytes {
  param(
    [string]$PayloadFileValue,
    [string]$TextValue
  )

  if ($PayloadFileValue) {
    $fullPath = Resolve-Path $PayloadFileValue
    $raw = Get-Content -Raw $fullPath
    if ($raw.Length -gt 0 -and $raw[0] -eq [char]0xFEFF) {
      $raw = $raw.Substring(1)
    }
    return [System.Text.Encoding]::UTF8.GetBytes($raw)
  }

  if ($TextValue -ne "") {
    return [System.Text.Encoding]::UTF8.GetBytes($TextValue)
  }

  throw "Provide -PayloadFile or -Text"
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

if (-not $Port) {
  throw "-Port is required and must point to the XL01 CMD serial port"
}

if ($SourcePort -lt 0 -or $SourcePort -gt 99) {
  throw "SourcePort must be in [0,99]"
}

if ($DestinationPort -lt 0 -or $DestinationPort -gt 127) {
  throw "DestinationPort must be in [0,127]"
}

$payloadBytes = Get-PayloadBytes -PayloadFileValue $PayloadFile -TextValue $Text
$remoteAddressBytes = Convert-HexAddressToBytes -Value $RemoteAddress

$session = New-Object System.Collections.Generic.List[byte]
$session.Add([byte]$SourcePort)
$session.Add([byte]$DestinationPort)
foreach ($b in $remoteAddressBytes) {
  $session.Add($b)
}
foreach ($b in $payloadBytes) {
  $session.Add($b)
}

$crc = Get-Crc8 -Bytes $session.ToArray()
$session.Add($crc)
$escapedPayload = Escape-Cc9d -Bytes $session.ToArray()

$frame = New-Object System.Collections.Generic.List[byte]
$frame.Add(0x9D)
foreach ($b in $escapedPayload) {
  $frame.Add($b)
}
$frame.Add(0x9D)

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  mode = if ($DryRun) { "dry-run" } else { "live" }
  port = $Port
  baudRate = $BaudRate
  remoteAddress = ("0x{0}" -f ([Convert]::ToUInt16($RemoteAddress, 16).ToString("X4")))
  sourcePort = $SourcePort
  destinationPort = $DestinationPort
  payloadBytes = $payloadBytes.Length
  sessionBytes = $session.Count
  crc8 = ("0x{0}" -f $crc.ToString("X2"))
  frameBytes = $frame.Count
  frameHex = (($frame.ToArray() | ForEach-Object { $_.ToString("X2") }) -join " ")
  note = "Use this only on the XL01 CMD port. DestinationPort 112 targets the remote USR serial."
}

if ($DryRun) {
  $result | ConvertTo-Json -Depth 5
  return
}

$serial = New-Object System.IO.Ports.SerialPort $Port, $BaudRate, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
$serial.Handshake = [System.IO.Ports.Handshake]::None
$serial.DtrEnable = $false
$serial.RtsEnable = $false
$serial.ReadTimeout = 500
$serial.WriteTimeout = 5000

try {
  $serial.Open()
  $frameArray = $frame.ToArray()
  $serial.Write($frameArray, 0, $frameArray.Length)
} finally {
  if ($serial.IsOpen) {
    $serial.Close()
  }
  $serial.Dispose()
}

$result | ConvertTo-Json -Depth 5
