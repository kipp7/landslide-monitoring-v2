function Get-HardwareStableVersionPortNameFromFriendlyName {
  param([string]$FriendlyName)

  if (-not $FriendlyName) {
    return ""
  }

  if ($FriendlyName -match '\((COM\d+)\)') {
    return ([string]$matches[1]).ToUpperInvariant()
  }

  return ""
}

function Test-HardwareStableVersionUsbSerialFriendlyName {
  param([string]$FriendlyName)

  if (-not $FriendlyName) {
    return $false
  }

  return ($FriendlyName -match 'USB Serial|USB-SERIAL|CH340|CP210|FTDI|Prolific|Qualcomm|J-Link CDC')
}

function Get-HardwareStableVersionSystemIoPortNames {
  $portNames = @()
  $available = $false
  $warning = $null

  try {
    $type = [System.Type]::GetType("System.IO.Ports.SerialPort, System.IO.Ports")
    if (-not $type) {
      $type = [System.Type]::GetType("System.IO.Ports.SerialPort")
    }
    if ($type -and $type.GetMethod("GetPortNames")) {
      $portNames = @($type.GetMethod("GetPortNames").Invoke($null, @()) | ForEach-Object { ([string]$_).ToUpperInvariant() } | Sort-Object -Unique)
      $available = $true
    } else {
      $warning = "System.IO.Ports.SerialPort.GetPortNames is unavailable in the current PowerShell runtime"
    }
  } catch {
    $warning = $_.Exception.Message
  }

  return [ordered]@{
    available = $available
    warning = $warning
    portNames = $portNames
  }
}

function ConvertTo-HardwareStableVersionPortDeviceRecord {
  param($Device)

  $portName = Get-HardwareStableVersionPortNameFromFriendlyName -FriendlyName ([string]$Device.FriendlyName)
  if (-not $portName) {
    return $null
  }

  return [ordered]@{
    Status = [string]$Device.Status
    Class = [string]$Device.Class
    FriendlyName = [string]$Device.FriendlyName
    InstanceId = [string]$Device.InstanceId
    PortName = $portName
    IsBluetooth = ([string]$Device.InstanceId -like 'BTHENUM*')
    IsUsbSerial = (Test-HardwareStableVersionUsbSerialFriendlyName -FriendlyName ([string]$Device.FriendlyName))
  }
}

function Get-HardwareStableVersionPresentPortDevices {
  $records = @()

  foreach ($device in @(Get-PnpDevice -PresentOnly -Class Ports -ErrorAction SilentlyContinue | Select-Object Status, Class, FriendlyName, InstanceId)) {
    $record = ConvertTo-HardwareStableVersionPortDeviceRecord -Device $device
    if ($record) {
      $records += $record
    }
  }

  return @($records)
}

function Get-HardwareStableVersionAllPortDevices {
  $records = @()

  foreach ($device in @(Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue | Select-Object Status, Class, FriendlyName, InstanceId)) {
    $record = ConvertTo-HardwareStableVersionPortDeviceRecord -Device $device
    if ($record) {
      $records += $record
    }
  }

  return @($records)
}

function Get-HardwareStableVersionWin32SerialPorts {
  $records = @()

  foreach ($port in @(Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | Select-Object DeviceID, Name, Description, PNPDeviceID, ProviderType, Status)) {
    $records += [ordered]@{
      DeviceID = ([string]$port.DeviceID).ToUpperInvariant()
      Name = [string]$port.Name
      Description = [string]$port.Description
      PNPDeviceID = [string]$port.PNPDeviceID
      ProviderType = [string]$port.ProviderType
      Status = [string]$port.Status
      IsBluetooth = ([string]$port.PNPDeviceID -like 'BTHENUM*')
      IsUsbSerial = (Test-HardwareStableVersionUsbSerialFriendlyName -FriendlyName ([string]$port.Name))
    }
  }

  return @($records)
}

function Get-HardwareStableVersionPresentCh340Entities {
  $records = @()

  foreach ($entity in @(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*CH340*' } | Select-Object Name, PNPDeviceID, Status, ConfigManagerErrorCode, Present)) {
    $records += [ordered]@{
      Name = [string]$entity.Name
      PNPDeviceID = [string]$entity.PNPDeviceID
      Status = [string]$entity.Status
      ConfigManagerErrorCode = $entity.ConfigManagerErrorCode
      Present = [bool]$entity.Present
    }
  }

  return @($records)
}

function Get-HardwareStableVersionCh340RegistryAssignments {
  $records = @()
  $presentEntityMap = @{}

  foreach ($entity in @(Get-HardwareStableVersionPresentCh340Entities)) {
    $presentEntityMap[[string]$entity.PNPDeviceID] = $entity
  }

  foreach ($instance in @(Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Enum\USB\VID_1A86&PID_7523' -ErrorAction SilentlyContinue)) {
    $instanceId = ('USB\VID_1A86&PID_7523\' + $instance.PSChildName).ToUpperInvariant()
    $deviceParametersPath = Join-Path $instance.PSPath 'Device Parameters'
    $deviceProps = Get-ItemProperty -Path $instance.PSPath -ErrorAction SilentlyContinue
    $deviceParameters = if (Test-Path $deviceParametersPath) { Get-ItemProperty -Path $deviceParametersPath -ErrorAction SilentlyContinue } else { $null }
    $presentEntity = if ($presentEntityMap.ContainsKey($instanceId)) { $presentEntityMap[$instanceId] } else { $null }
    $portName = if ($deviceParameters -and $deviceParameters.PortName) { ([string]$deviceParameters.PortName).ToUpperInvariant() } else { "" }

    $records += [ordered]@{
      InstanceId = $instanceId
      FriendlyName = if ($deviceProps) { [string]$deviceProps.FriendlyName } else { "" }
      PortName = $portName
      SymbolicName = if ($deviceParameters) { [string]$deviceParameters.SymbolicName } else { "" }
      Present = if ($presentEntity) { [bool]$presentEntity.Present } else { $false }
      PresentStatus = if ($presentEntity) { [string]$presentEntity.Status } else { "" }
      ConfigManagerErrorCode = if ($presentEntity) { $presentEntity.ConfigManagerErrorCode } else { $null }
    }
  }

  return @($records)
}

function Get-HardwareStableVersionSerialPortInventory {
  $systemIo = Get-HardwareStableVersionSystemIoPortNames
  $presentPorts = Get-HardwareStableVersionPresentPortDevices
  $allPorts = Get-HardwareStableVersionAllPortDevices
  $win32Ports = Get-HardwareStableVersionWin32SerialPorts
  $presentCh340Entities = Get-HardwareStableVersionPresentCh340Entities
  $ch340RegistryAssignments = Get-HardwareStableVersionCh340RegistryAssignments

  $visiblePortNames = @(
    @($systemIo.portNames)
    @($presentPorts | ForEach-Object { [string]$_.PortName })
    @($win32Ports | ForEach-Object { [string]$_.DeviceID })
  ) | Where-Object { $_ } | Sort-Object -Unique

  $primaryMethod = if ($systemIo.available) {
    "system.io.ports"
  } elseif (@($win32Ports).Count -gt 0) {
    "win32_serialport"
  } elseif (@($presentPorts).Count -gt 0) {
    "pnpdevice"
  } else {
    "none"
  }

  return [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    sourceMethods = [ordered]@{
      primaryMethod = $primaryMethod
      systemIoPortsAvailable = [bool]$systemIo.available
      systemIoPortsWarning = [string]$systemIo.warning
      systemIoPortNames = @($systemIo.portNames)
    }
    visiblePortNames = @($visiblePortNames)
    presentPorts = @($presentPorts)
    allPorts = @($allPorts)
    win32Ports = @($win32Ports)
    presentCh340Entities = @($presentCh340Entities)
    ch340RegistryAssignments = @($ch340RegistryAssignments)
  }
}

function Get-HardwareStableVersionSerialPortOwnership {
  param(
    [string]$PortName,
    $Inventory = $null
  )

  $normalizedPortName = ([string]$PortName).Trim().ToUpperInvariant()
  if (-not $Inventory) {
    $Inventory = Get-HardwareStableVersionSerialPortInventory
  }

  if (-not $normalizedPortName) {
    return [ordered]@{
      port = ""
      classification = "port-name-missing"
      ownershipStable = $false
      recommendedNextSteps = @(
        "specify a concrete COM port name such as COM5 before running live hardware checks"
      )
    }
  }

  $presentMatches = @($Inventory.presentPorts | Where-Object { [string]$_.PortName -eq $normalizedPortName })
  $allMatches = @($Inventory.allPorts | Where-Object { [string]$_.PortName -eq $normalizedPortName })
  $win32Matches = @($Inventory.win32Ports | Where-Object { [string]$_.DeviceID -eq $normalizedPortName })
  $historicalCh340Assignments = @($Inventory.ch340RegistryAssignments | Where-Object { [string]$_.PortName -eq $normalizedPortName })

  $presentBluetooth = @($presentMatches | Where-Object { $_.IsBluetooth })
  $presentUsbSerial = @($presentMatches | Where-Object { $_.IsUsbSerial })
  $visibleInSystemIoPorts = (@($Inventory.sourceMethods.systemIoPortNames | Where-Object { $_ -eq $normalizedPortName }).Count -gt 0)

  $classification = if ($presentBluetooth.Count -gt 0 -and $presentUsbSerial.Count -gt 0) {
    "ownership-collision-bluetooth-and-usb-serial"
  } elseif ($presentBluetooth.Count -gt 0 -and $presentUsbSerial.Count -eq 0) {
    "bluetooth-owned"
  } elseif ($presentUsbSerial.Count -gt 1) {
    "multiple-present-usb-serial-devices"
  } elseif ($presentUsbSerial.Count -eq 1) {
    "usb-serial-visible"
  } elseif ($historicalCh340Assignments.Count -gt 0) {
    "historical-usb-serial-assignment-only"
  } elseif ($win32Matches.Count -gt 0) {
    "win32-visible-without-usb-serial-match"
  } elseif ($allMatches.Count -gt 0) {
    "port-listed-but-not-present"
  } else {
    "port-not-detected"
  }

  $recommendedNextSteps = switch ($classification) {
    "ownership-collision-bluetooth-and-usb-serial" {
      @(
        "move Bluetooth serial devices or the CH340 adapter onto a unique COM number before treating this port as a stable hardware baseline",
        "prefer the CH340 instance that is Present=true and Status=OK, then re-run the live command gate against that port only",
        "re-run scripts/dev/show-hardware-stable-version-serial-ports.ps1 after any COM-number change and expect a single stable owner for this port"
      )
    }
    "bluetooth-owned" {
      @(
        "do not use this port for XL01 or RK2206 relay traffic while it is owned only by Bluetooth serial devices",
        "identify the active CH340 device and move the hardware baseline to that COM number"
      )
    }
    "usb-serial-visible" {
      @(
        "this port has a single visible USB serial owner; proceed with passive probe or live gate validation on this port",
        "avoid opening this port from multiple tools at once"
      )
    }
    "multiple-present-usb-serial-devices" {
      @(
        "the same COM number appears to be claimed by more than one present USB serial device; clean up stale mappings before live testing",
        "replug the intended adapter and confirm only one Present=true USB serial owner remains"
      )
    }
    "historical-usb-serial-assignment-only" {
      @(
        "this COM number still exists in historical CH340 assignments, but no present USB serial owner is active right now",
        "replug the intended adapter and verify which COM number it claims after reconnect"
      )
    }
    default {
      @(
        "verify which physical adapter is currently attached and re-enumerate the host serial devices before running live hardware scripts"
      )
    }
  }

  return [ordered]@{
    port = $normalizedPortName
    classification = $classification
    ownershipStable = ($classification -eq "usb-serial-visible")
    visibleInSystemIoPorts = $visibleInSystemIoPorts
    presentDeviceCount = $presentMatches.Count
    presentBluetoothCount = $presentBluetooth.Count
    presentUsbSerialCount = $presentUsbSerial.Count
    win32DeviceCount = $win32Matches.Count
    historicalCh340AssignmentCount = $historicalCh340Assignments.Count
    presentDevices = @($presentMatches)
    win32Devices = @($win32Matches)
    historicalCh340Assignments = @($historicalCh340Assignments)
    recommendedNextSteps = $recommendedNextSteps
  }
}

function Get-HardwareStableVersionSerialPortOwnershipSummary {
  param($Inventory = $null)

  if (-not $Inventory) {
    $Inventory = Get-HardwareStableVersionSerialPortInventory
  }

  $portNames = @(
    @($Inventory.visiblePortNames)
    @($Inventory.presentPorts | ForEach-Object { [string]$_.PortName })
    @($Inventory.allPorts | ForEach-Object { [string]$_.PortName })
    @($Inventory.ch340RegistryAssignments | ForEach-Object { [string]$_.PortName })
  ) | Where-Object { $_ } | Sort-Object -Unique

  $ownership = @()
  foreach ($portName in $portNames) {
    $ownership += Get-HardwareStableVersionSerialPortOwnership -PortName $portName -Inventory $Inventory
  }

  return @($ownership)
}
