param(
  [string]$CasterHost = "rtk2go.com",
  [int]$CasterPort = 2101,
  [Parameter(Mandatory = $true)]
  [string]$MountPoint,
  [Parameter(Mandatory = $true)]
  [string]$SerialPortName,
  [int]$SerialBaudRate = 9600,
  [string]$Username = "",
  [string]$Password = "",
  [string]$Gga = "",
  [int]$DurationSeconds = 60
)

$ErrorActionPreference = "Stop"

function New-NtripRequest {
  param(
    [string]$MountPoint,
    [string]$HostName,
    [int]$Port,
    [string]$Username,
    [string]$Password
  )

  $lines = @(
    "GET /$MountPoint HTTP/1.0",
    "User-Agent: NTRIP lsmv2-rtcm-debug",
    "Host: ${HostName}:${Port}",
    "Accept: */*",
    "Connection: close"
  )

  if ($Username.Length -gt 0 -or $Password.Length -gt 0) {
    $raw = "${Username}:${Password}"
    $auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($raw))
    $lines += "Authorization: Basic $auth"
  }

  return (($lines -join "`r`n") + "`r`n`r`n")
}

function Open-SerialPort {
  param(
    [string]$PortName,
    [int]$BaudRate
  )

  $serial = [System.IO.Ports.SerialPort]::new($PortName, $BaudRate, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)
  $serial.ReadTimeout = 500
  $serial.WriteTimeout = 2000
  $serial.Open()
  return $serial
}

$serial = $null
$client = $null

try {
  Write-Host "[ntrip] opening serial $SerialPortName baud=$SerialBaudRate"
  $serial = Open-SerialPort -PortName $SerialPortName -BaudRate $SerialBaudRate

  Write-Host "[ntrip] connecting ${CasterHost}:${CasterPort}/$MountPoint"
  $client = [System.Net.Sockets.TcpClient]::new()
  $client.ReceiveTimeout = 10000
  $client.SendTimeout = 10000
  $client.Connect($CasterHost, $CasterPort)
  $stream = $client.GetStream()

  $request = New-NtripRequest -MountPoint $MountPoint -HostName $CasterHost -Port $CasterPort -Username $Username -Password $Password
  $requestBytes = [Text.Encoding]::ASCII.GetBytes($request)
  $stream.Write($requestBytes, 0, $requestBytes.Length)

  if ($Gga.Length -gt 0) {
    $ggaLine = $Gga.Trim()
    if (-not $ggaLine.EndsWith("`r`n")) {
      $ggaLine = $ggaLine + "`r`n"
    }
    $ggaBytes = [Text.Encoding]::ASCII.GetBytes($ggaLine)
    $stream.Write($ggaBytes, 0, $ggaBytes.Length)
    Write-Host "[ntrip] sent initial GGA to caster"
  }

  $buffer = New-Object byte[] 4096
  $deadline = [DateTime]::UtcNow.AddSeconds($DurationSeconds)
  $totalBytes = 0
  $firstChunk = $true

  while ([DateTime]::UtcNow -lt $deadline) {
    if (-not $stream.DataAvailable) {
      Start-Sleep -Milliseconds 50
      continue
    }

    $read = $stream.Read($buffer, 0, $buffer.Length)
    if ($read -le 0) {
      break
    }

    if ($firstChunk) {
      $firstChunk = $false
      $prefixLen = [Math]::Min($read, 120)
      $prefix = [Text.Encoding]::ASCII.GetString($buffer, 0, $prefixLen)
      if ($prefix.StartsWith("SOURCETABLE") -or $prefix.StartsWith("HTTP/") -or $prefix.Contains("ERROR")) {
        Write-Host "[ntrip] caster response prefix:"
        Write-Host $prefix
      }
    }

    $serial.Write($buffer, 0, $read)
    $totalBytes += $read

    if (($totalBytes % 8192) -lt $read) {
      Write-Host "[ntrip] forwarded bytes=$totalBytes"
    }
  }

  Write-Host "[ntrip] done forwarded_bytes=$totalBytes duration_s=$DurationSeconds"
} finally {
  if ($serial -ne $null -and $serial.IsOpen) {
    $serial.Close()
  }
  if ($client -ne $null) {
    $client.Close()
  }
}
