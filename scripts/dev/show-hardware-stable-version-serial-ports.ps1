param(
  [int]$WatchSeconds = 0
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
. (Join-Path $PSScriptRoot "hardware-stable-version-serial-port-common.ps1")

function Get-SerialPortProbe {
  $inventory = Get-HardwareStableVersionSerialPortInventory
  $portOwnership = Get-HardwareStableVersionSerialPortOwnershipSummary -Inventory $inventory
  $warning = $null

  if (-not $inventory.sourceMethods.systemIoPortsAvailable) {
    $warning = if ($inventory.sourceMethods.systemIoPortsWarning) {
      "System.IO.Ports.SerialPort is unavailable; using Win32/PnP enumeration. $($inventory.sourceMethods.systemIoPortsWarning)"
    } else {
      "System.IO.Ports.SerialPort is unavailable; using Win32/PnP enumeration"
    }
  } elseif (@($portOwnership | Where-Object { $_.classification -eq "ownership-collision-bluetooth-and-usb-serial" }).Count -gt 0) {
    $warning = "At least one COM number has both Bluetooth and USB serial owners; port names alone are not a stable hardware identifier on this host"
  }

  return [ordered]@{
    generatedAt = $inventory.generatedAt
    method = [string]$inventory.sourceMethods.primaryMethod
    warning = $warning
    ports = @($inventory.visiblePortNames)
    systemIoPorts = @($inventory.sourceMethods.systemIoPortNames)
    presentPorts = @($inventory.presentPorts)
    win32Ports = @($inventory.win32Ports)
    portOwnership = @($portOwnership)
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
