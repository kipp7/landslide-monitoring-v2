param(
  [string]$OutFile = "docs/unified/reports/hardware-stable-version-serial-root-cause-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-PortsDevices {
  @(Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue | Select-Object Status, Class, FriendlyName, InstanceId)
}

function Get-SuspiciousUsbDevices {
  @(Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object {
      $_.FriendlyName -match 'USB 2.0 BILLBOARD|Billboard|USB Composite Device|Android Composite ADB Interface|USB Receiver|USB Serial|USB-SERIAL|CH340|CP210|FTDI|Prolific|Qualcomm|J-Link CDC'
    } | Select-Object Status, Class, FriendlyName, InstanceId)
}

function Get-PortDriverPackages {
  $raw = pnputil /enum-drivers
  $entries = @()
  $current = [ordered]@{}

  foreach ($line in $raw) {
    if ($line -match '^Published Name:\s+(.+)$') {
      if ($current.Count -gt 0) {
        $entries += [pscustomobject]$current
      }
      $current = [ordered]@{ PublishedName = $matches[1].Trim() }
      continue
    }
    if ($current.Count -eq 0) { continue }
    if ($line -match '^Original Name:\s+(.+)$') { $current.OriginalName = $matches[1].Trim(); continue }
    if ($line -match '^Provider Name:\s+(.+)$') { $current.ProviderName = $matches[1].Trim(); continue }
    if ($line -match '^Class Name:\s+(.+)$') { $current.ClassName = $matches[1].Trim(); continue }
    if ($line -match '^Driver Version:\s+(.+)$') { $current.DriverVersion = $matches[1].Trim(); continue }
    if ($line -match '^Signer Name:\s+(.+)$') { $current.SignerName = $matches[1].Trim(); continue }
  }
  if ($current.Count -gt 0) {
    $entries += [pscustomobject]$current
  }

  return @($entries | Where-Object {
      $_.ClassName -eq "Ports" -or $_.OriginalName -match 'ch341|ftdi|ser2pl|qcser|sprdv|jlinkcdc|arduino|linino'
    })
}

function Get-BillboardEvents {
  @(Get-WinEvent -LogName 'Microsoft-Windows-DeviceSetupManager/Admin' -MaxEvents 120 -ErrorAction SilentlyContinue |
      Where-Object { $_.Message -match 'USB 2.0 BILLBOARD|Billboard' } |
      Select-Object -First 10 TimeCreated, Id, LevelDisplayName, Message)
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $ports = Get-PortsDevices
  $suspicious = Get-SuspiciousUsbDevices
  $drivers = Get-PortDriverPackages
  $billboardEvents = Get-BillboardEvents

  $nonBluetoothPorts = @($ports | Where-Object { $_.InstanceId -notlike 'BTHENUM*' })
  $bluetoothPorts = @($ports | Where-Object { $_.InstanceId -like 'BTHENUM*' })
  $billboardPresent = @($suspicious | Where-Object { $_.FriendlyName -match 'BILLBOARD|Billboard' }).Count -gt 0
  $usbSerialPresent = @($suspicious | Where-Object {
      $_.FriendlyName -match 'USB Serial|USB-SERIAL|CH340|CP210|FTDI|Prolific|Qualcomm|J-Link CDC'
    }).Count -gt 0

  $likelyCause = if ($nonBluetoothPorts.Count -eq 0 -and $billboardEvents.Count -gt 0) {
    "connected-device-is-enumerating-as-usb-billboard-or-non-serial-usb-function-instead-of-usb-uart-com-port"
  } elseif ($nonBluetoothPorts.Count -eq 0 -and $drivers.Count -gt 0) {
    "serial-drivers-are-installed-but-no-physical-usb-uart-device-is-currently-present"
  } else {
    "serial-port-state-needs-manual-review"
  }

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    conclusion = "hardware-stable-version-current-host-has-no-present-physical-com-port-and-the-most-likely-blocker-is-device-or-cable-enumeration-mode"
    checks = [ordered]@{
      anyPortsClassDevices = ($ports.Count -gt 0)
      anyNonBluetoothPortsPresent = ($nonBluetoothPorts.Count -gt 0)
      bluetoothPortsOnly = ($ports.Count -gt 0 -and $nonBluetoothPorts.Count -eq 0)
      usbSerialPresent = $usbSerialPresent
      billboardSignalsPresent = ($billboardEvents.Count -gt 0)
      serialDriverPackagesInstalled = ($drivers.Count -gt 0)
    }
    likelyCause = $likelyCause
    currentPorts = [ordered]@{
      all = $ports
      nonBluetooth = $nonBluetoothPorts
      bluetooth = $bluetoothPorts
    }
    suspiciousUsbDevices = $suspicious
    installedSerialDrivers = $drivers
    recentBillboardEvents = $billboardEvents
    recommendedNextSteps = @(
      "reconnect the board or adapter with a known data-capable USB cable, not a charge-only cable",
      "prefer a direct USB-A/USB-C data connection or a known USB-UART dongle that should enumerate as CH340/CP210/FTDI instead of a Type-C alternate-mode adapter path",
      "avoid the current USB Billboard path; per Microsoft, Billboard enumeration indicates alternate-mode negotiation or compatibility failure rather than a normal UART/COM function",
      "after reconnecting, rerun scripts/dev/show-hardware-stable-version-serial-ports.ps1 and expect a non-Bluetooth Started COM device"
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
