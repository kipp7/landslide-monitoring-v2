param(
  [int]$WatchSeconds = 0
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    method = $method
    warning = $warning
    ports = $ports
  }
}

if ($WatchSeconds -gt 0) {
  $deadline = (Get-Date).AddSeconds($WatchSeconds)
  $lastJson = $null
  do {
    $probe = Get-SerialPortProbe
    $json = $probe | ConvertTo-Json -Depth 5
    if ($json -ne $lastJson) {
      $json
      $lastJson = $json
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
} else {
  (Get-SerialPortProbe | ConvertTo-Json -Depth 5)
}
