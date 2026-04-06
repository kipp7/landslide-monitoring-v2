param(
  [string]$Port = "COM5",
  [int[]]$Bauds = @(115200, 9600, 57600, 38400, 19200),
  [int]$SecondsPerBaud = 4,
  [string]$OutFile = "docs/unified/reports/hardware-stable-version-passive-serial-probe-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Probe-Baud {
  param(
    [string]$Port,
    [int]$Baud,
    [int]$Seconds
  )

  $sp = New-Object System.IO.Ports.SerialPort $Port,$Baud,([System.IO.Ports.Parity]::None),8,([System.IO.Ports.StopBits]::One)
  $sp.Handshake = [System.IO.Ports.Handshake]::None
  $sp.DtrEnable = $false
  $sp.RtsEnable = $false
  $sp.ReadTimeout = 250
  $bytes = New-Object System.Collections.Generic.List[byte]
  $start = Get-Date

  try {
    $sp.Open()
    while (((Get-Date) - $start).TotalSeconds -lt $Seconds) {
      while ($sp.BytesToRead -gt 0 -and $bytes.Count -lt 2048) {
        $bytes.Add([byte]$sp.ReadByte()) | Out-Null
      }
      Start-Sleep -Milliseconds 50
    }
  } finally {
    if ($sp.IsOpen) { $sp.Close() }
    $sp.Dispose()
  }

  $count = $bytes.Count
  $ffCount = @($bytes | Where-Object { $_ -eq 0xFF }).Count
  $zeroCount = @($bytes | Where-Object { $_ -eq 0x00 }).Count
  $asciiCount = @($bytes | Where-Object { $_ -ge 0x20 -and $_ -le 0x7E }).Count
  $newlineCount = @($bytes | Where-Object { $_ -eq 0x0A -or $_ -eq 0x0D }).Count
  $highByteRatio = if ($count -gt 0) { [math]::Round((@($bytes | Where-Object { $_ -ge 0xF0 }).Count / $count), 4) } else { 0 }
  $hexPreview = ((@($bytes | Select-Object -First 64) | ForEach-Object { $_.ToString("X2") }) -join " ")

  $classification = if ($count -eq 0) {
    "silent"
  } elseif ($highByteRatio -ge 0.85 -and $asciiCount -eq 0) {
    "high-level-noise-or-floating-line"
  } elseif ($asciiCount -gt 0 -and ($asciiCount / $count) -ge 0.5) {
    "mostly-ascii-text"
  } else {
    "binary-or-unstructured-stream"
  }

  return [ordered]@{
    baud = $Baud
    durationSeconds = $Seconds
    byteCount = $count
    ffCount = $ffCount
    zeroCount = $zeroCount
    asciiCount = $asciiCount
    newlineCount = $newlineCount
    highByteRatio = $highByteRatio
    classification = $classification
    hexPreview = $hexPreview
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $results = @()
  foreach ($baud in $Bauds) {
    $results += Probe-Baud -Port $Port -Baud $baud -Seconds $SecondsPerBaud
  }

  $bestAscii = $results | Sort-Object asciiCount -Descending | Select-Object -First 1
  $bestTraffic = $results | Sort-Object byteCount -Descending | Select-Object -First 1

  $likelyCause = if ($bestTraffic.byteCount -gt 0 -and $bestTraffic.classification -eq "high-level-noise-or-floating-line") {
    "port-is-active-but-current-signal-looks-like-floating-line-level-mismatch-or-wrong-uart-wiring-not-readable-serial-text"
  } elseif ($bestAscii.asciiCount -gt 0) {
    "port-is-producing-readable-or-partially-readable-serial-output-at-one-of-the-probed-baud-rates"
  } else {
    "port-is-present-but-no-useful-readable-output-was-observed-during-passive-probe"
  }

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    conclusion = "hardware-stable-version-passive-serial-probe-captured-current-com-port-signal-shape-without-writing-bytes"
    port = $Port
    checks = [ordered]@{
      anyTrafficObserved = (@($results | Where-Object { $_.byteCount -gt 0 }).Count -gt 0)
      anyReadableAsciiObserved = (@($results | Where-Object { $_.asciiCount -gt 0 }).Count -gt 0)
      dominantProbeLooksLikeNoise = ($bestTraffic.classification -eq "high-level-noise-or-floating-line")
    }
    likelyCause = $likelyCause
    probes = $results
    recommendedNextSteps = @(
      "verify TX/RX are crossed correctly and that GND is shared",
      "verify the attached board really exposes a UART TX on this CH340 path instead of another USB function",
      "verify voltage level compatibility and avoid attaching the CH340 RX to a floating or powered-off line",
      "if this is expected to be the XL01 path, start with 115200 and look for non-0xFF traffic after confirming wiring"
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
