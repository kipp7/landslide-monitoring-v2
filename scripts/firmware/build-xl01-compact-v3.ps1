[CmdletBinding()]
param(
  [string]$SdkRoot = "F:\2\openharmony\txsmartropenharmony",
  [string]$ContainerName = "openharmony-dev",
  [string]$ArtifactDirectory = "",
  [ValidateSet("disabled", "probe", "live")]
  [string]$GnssRtcmInjectionMode = "disabled",
  [ValidateSet("hardware", "simulated")]
  [string]$FieldSensorMode = "hardware",
  [ValidateSet(3, 4)]
  [int]$CompactVersion = 3,
  [ValidateRange(800000, 1200000)]
  [int]$BatteryCalibrationGainPpm = 1000000,
  [ValidateRange(-2000, 2000)]
  [int]$BatteryCalibrationOffsetMv = 0,
  [string]$BatteryCalibrationFile = "",
  [ValidateSet("A", "B", "C")]
  [string[]]$NodeLabels = @("A", "B", "C"),
  [switch]$KeepSdkExperimentSource
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sourceRoot = Join-Path $repoRoot "firmware\rk2206-xl01"
$sampleRelative = "vendor\isoftstone\rk2206\samples\xl01_landslide_monitor_v1.1"
$sampleRoot = Join-Path $SdkRoot $sampleRelative
$productOut = Join-Path $SdkRoot "out\rk2206\isoftstone-rk2206"
if (-not $ArtifactDirectory) {
  $ArtifactDirectory = Join-Path $repoRoot ("artifacts\firmware\rk2206-xl01-compact-v{0}-{1}" -f $CompactVersion, $FieldSensorMode)
}
$artifactRoot = [System.IO.Path]::GetFullPath($ArtifactDirectory)
$backupRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("xls1-compact-sdk-backup-" + [guid]::NewGuid().ToString("N"))
$sourceCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $sourceCommit) {
  throw "Cannot resolve the source commit for the firmware manifest"
}
$sourceDirty = @(& git -C $repoRoot status --porcelain --untracked-files=normal).Count -gt 0

$syncFiles = @(
  "BUILD.gn",
  "config\app_config.h",
  "main\landslide_main.c",
  "drivers\xl01\field_link_frame.c",
  "drivers\xl01\field_link_frame.h",
  "drivers\xl01\field_link_rx_stats.c",
  "drivers\xl01\field_link_rx_stats.h",
  "drivers\xl01\gnss_transport_v3.c",
  "drivers\xl01\gnss_transport_v3.h",
  "drivers\xl01\gnss_rtcm_injection.c",
  "drivers\xl01\gnss_rtcm_injection.h",
  "drivers\xl01\xl01_driver.c",
  "drivers\xl01\xl01_driver.h",
  "drivers\sensors\gps_driver.c",
  "drivers\sensors\gps_driver.h",
  "drivers\sensors\gnss_solution_parser.c",
  "drivers\sensors\gnss_solution_parser.h",
  "drivers\sensors\battery_monitor.c",
  "drivers\sensors\battery_monitor.h",
  "drivers\sensors\simulated_field_sensors.c",
  "drivers\sensors\simulated_field_sensors.h",
  "app\sensor_data.h",
  "app\battery_estimator.c",
  "app\battery_estimator.h",
  "app\compact_telemetry_builder.c",
  "app\compact_telemetry_builder.h",
  "app\telemetry_envelope_builder.c",
  "app\telemetry_envelope_builder.h",
  "app\compact_poll_command.c",
  "app\compact_poll_command.h",
  "app\gnss_probe_stats_protocol.c",
  "app\gnss_probe_stats_protocol.h",
  "drivers\sensors\field_sensors_rs485.c",
  "drivers\sensors\field_sensors_rs485.h",
  "drivers\sensors\field_alarm_rs485.c",
  "drivers\sensors\field_alarm_rs485.h",
  "drivers\sensors\rs485_modbus.c",
  "drivers\sensors\rs485_modbus.h",
  "drivers\sensors\sc16is752_driver.c",
  "drivers\sensors\sc16is752_driver.h"
)

$nodes = @(
  @{ Label = "A"; Suffix = "0001"; DeviceId = "00000000-0000-0000-0000-000000000001"; InstallLabel = "FIELD-NODE-A" },
  @{ Label = "B"; Suffix = "0002"; DeviceId = "00000000-0000-0000-0000-000000000002"; InstallLabel = "FIELD-NODE-B" },
  @{ Label = "C"; Suffix = "0003"; DeviceId = "00000000-0000-0000-0000-000000000003"; InstallLabel = "FIELD-NODE-C" }
)

$resolvedBatteryCalibrationFile = $null
$batteryCalibrationFileSha256 = $null
$batteryCalibrationDocument = $null
if ($BatteryCalibrationFile) {
  $resolvedBatteryCalibrationFile = (Resolve-Path -LiteralPath $BatteryCalibrationFile -ErrorAction Stop).Path
  $batteryCalibrationDocument = Get-Content -LiteralPath $resolvedBatteryCalibrationFile -Raw | ConvertFrom-Json
  if ($batteryCalibrationDocument.schemaVersion -ne 1 -or $null -eq $batteryCalibrationDocument.nodes) {
    throw "Battery calibration file must use schemaVersion 1 and contain a nodes object"
  }
  $batteryCalibrationFileSha256 =
    (Get-FileHash -LiteralPath $resolvedBatteryCalibrationFile -Algorithm SHA256).Hash.ToLowerInvariant()
}

$nodeBatteryCalibrations = [ordered]@{}
foreach ($node in $nodes | Where-Object { $_.Label -in $NodeLabels }) {
  if ($null -eq $batteryCalibrationDocument) {
    $nodeBatteryCalibrations[$node.Label] = [ordered]@{
      gainPpm = $BatteryCalibrationGainPpm
      offsetMv = $BatteryCalibrationOffsetMv
      verified = ($BatteryCalibrationGainPpm -ne 1000000 -or $BatteryCalibrationOffsetMv -ne 0)
    }
    continue
  }

  $nodeProperty = $batteryCalibrationDocument.nodes.PSObject.Properties[$node.Label]
  if ($null -eq $nodeProperty) {
    throw "Battery calibration file is missing node $($node.Label)"
  }
  $entry = $nodeProperty.Value
  if ([string]$entry.gainPpm -notmatch '^[0-9]+$' -or
      [string]$entry.offsetMv -notmatch '^-?[0-9]+$' -or
      $entry.verified -isnot [bool]) {
    throw "Battery calibration for node $($node.Label) has invalid gainPpm, offsetMv or verified"
  }
  $gainPpm = [int]$entry.gainPpm
  $offsetMv = [int]$entry.offsetMv
  if ($gainPpm -lt 800000 -or $gainPpm -gt 1200000 -or
      $offsetMv -lt -2000 -or $offsetMv -gt 2000) {
    throw "Battery calibration for node $($node.Label) is outside the supported range"
  }
  $nodeBatteryCalibrations[$node.Label] = [ordered]@{
    gainPpm = $gainPpm
    offsetMv = $offsetMv
    verified = [bool]$entry.verified
  }
}

function Set-SingleMacro {
  param(
    [string]$Text,
    [string]$Macro,
    [string]$Value
  )

  $pattern = "(?m)^#define\s+" + [regex]::Escape($Macro) + "\s+.*$"
  $matches = [regex]::Matches($Text, $pattern)
  if ($matches.Count -ne 1) {
    throw "Expected one $Macro definition, found $($matches.Count)"
  }
  return [regex]::Replace($Text, $pattern, "#define $Macro                `"$Value`"")
}

function Set-SingleTokenMacro {
  param(
    [string]$Text,
    [string]$Macro,
    [string]$Value
  )

  $pattern = "(?m)^#define\s+" + [regex]::Escape($Macro) + "\s+.*$"
  $matches = [regex]::Matches($Text, $pattern)
  if ($matches.Count -ne 1) {
    throw "Expected one $Macro definition, found $($matches.Count)"
  }
  return [regex]::Replace($Text, $pattern, "#define $Macro $Value")
}

function Get-QuotedMacroValue {
  param(
    [string]$Path,
    [string]$Macro
  )

  $text = [System.IO.File]::ReadAllText($Path)
  $pattern = '(?m)^#define\s+' + [regex]::Escape($Macro) + '\s+"([^"]+)"'
  $matches = [regex]::Matches($text, $pattern)
  if ($matches.Count -ne 1) {
    throw "Expected one quoted $Macro definition in $Path, found $($matches.Count)"
  }
  return $matches[0].Groups[1].Value
}

function Get-UnsignedMacroValue {
  param(
    [string]$Path,
    [string]$Macro
  )

  $text = [System.IO.File]::ReadAllText($Path)
  $pattern = '(?m)^#define\s+' + [regex]::Escape($Macro) + '\s+([0-9]+)U?\s*(?://.*)?$'
  $matches = [regex]::Matches($text, $pattern)
  if ($matches.Count -ne 1) {
    throw "Expected one unsigned $Macro definition in $Path, found $($matches.Count)"
  }
  return [uint32]$matches[0].Groups[1].Value
}

function Set-GnssRtcmInjectionMode {
  $modeToken = switch ($GnssRtcmInjectionMode) {
    "disabled" { "GNSS_RTCM_INJECTION_DISABLED" }
    "probe" { "GNSS_RTCM_INJECTION_PROBE" }
    "live" { "GNSS_RTCM_INJECTION_LIVE" }
  }
  $configPath = Join-Path $sampleRoot "config\app_config.h"
  $text = [System.IO.File]::ReadAllText($configPath)
  $text = Set-SingleTokenMacro -Text $text -Macro "GNSS_RTCM_INJECTION_MODE" -Value $modeToken
  [System.IO.File]::WriteAllText($configPath, $text, [System.Text.UTF8Encoding]::new($false))
}

function Set-CompactTelemetryVersion {
  $configPath = Join-Path $sampleRoot "config\app_config.h"
  $text = [System.IO.File]::ReadAllText($configPath)
  $text = Set-SingleTokenMacro `
    -Text $text `
    -Macro "TELEMETRY_PAYLOAD_FORMAT" `
    -Value ("TELEMETRY_PAYLOAD_FORMAT_COMPACT_V{0}" -f $CompactVersion)
  $text = Set-SingleMacro `
    -Text $text `
    -Macro "FIRMWARE_SAMPLE_VERSION" `
    -Value ("v1.3-um220-rs485-rtk-compact-v{0}" -f $CompactVersion)
  [System.IO.File]::WriteAllText($configPath, $text, [System.Text.UTF8Encoding]::new($false))

  $mainPath = Join-Path $sampleRoot "main\landslide_main.c"
  $mainText = [System.IO.File]::ReadAllText($mainPath)
  $mainText = Set-SingleMacro `
    -Text $mainText `
    -Macro "FW_RX_DIAG_MARKER" `
    -Value ("fw-rk2206-rtk-compact-v{0}-runtime-20260803" -f $CompactVersion)
  [System.IO.File]::WriteAllText($mainPath, $mainText, [System.Text.UTF8Encoding]::new($false))
}

function Set-FieldSensorMode {
  $modeToken = switch ($FieldSensorMode) {
    "hardware" { "FIELD_SENSOR_SOURCE_HARDWARE" }
    "simulated" { "FIELD_SENSOR_SOURCE_SIMULATED" }
  }
  $configPath = Join-Path $sampleRoot "config\app_config.h"
  $text = [System.IO.File]::ReadAllText($configPath)
  $text = Set-SingleTokenMacro -Text $text -Macro "FIELD_SENSOR_SOURCE" -Value $modeToken
  [System.IO.File]::WriteAllText($configPath, $text, [System.Text.UTF8Encoding]::new($false))
}

function Set-BatteryCalibration {
  param(
    [int]$GainPpm,
    [int]$OffsetMv,
    [bool]$Verified
  )

  $configPath = Join-Path $sampleRoot "config\app_config.h"
  $text = [System.IO.File]::ReadAllText($configPath)
  $text = Set-SingleTokenMacro -Text $text -Macro "BATTERY_CALIBRATION_GAIN_PPM" -Value ([string]$GainPpm)
  $text = Set-SingleTokenMacro -Text $text -Macro "BATTERY_CALIBRATION_OFFSET_MV" -Value ([string]$OffsetMv)
  $verifiedToken = if ($Verified) { "1" } else { "0" }
  $text = Set-SingleTokenMacro -Text $text -Macro "BATTERY_CALIBRATION_VERIFIED" -Value $verifiedToken
  [System.IO.File]::WriteAllText($configPath, $text, [System.Text.UTF8Encoding]::new($false))
}

function Set-NodeIdentity {
  param([hashtable]$Node)

  $configPath = Join-Path $sampleRoot "config\app_config.h"
  $text = [System.IO.File]::ReadAllText($configPath)
  $text = Set-SingleMacro -Text $text -Macro "DEVICE_ID" -Value $Node.DeviceId
  $text = Set-SingleMacro -Text $text -Macro "INSTALL_LABEL" -Value $Node.InstallLabel
  $text = Set-SingleMacro -Text $text -Macro "LEGACY_NODE_LABEL" -Value $Node.Label
  [System.IO.File]::WriteAllText($configPath, $text, [System.Text.UTF8Encoding]::new($false))
}

function Copy-BuildOutputs {
  param([hashtable]$Node)

  $imageSource = Join-Path $productOut "images\Firmware.img"
  $liteOsSource = Join-Path $productOut "liteos.bin"
  $loaderSource = Join-Path $productOut "images\rk2206_db_loader.bin"
  foreach ($required in @($imageSource, $liteOsSource)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
      throw "Required build output is missing: $required"
    }
  }

  $imageTarget = Join-Path $artifactRoot ("rk2206-node-{0}-xls1-compact-v{1}-{2}.img" -f $Node.Label, $CompactVersion, $FieldSensorMode)
  $liteOsTarget = Join-Path $artifactRoot ("rk2206-node-{0}-xls1-compact-v{1}-{2}.bin" -f $Node.Label, $CompactVersion, $FieldSensorMode)
  Copy-Item -LiteralPath $imageSource -Destination $imageTarget -Force
  Copy-Item -LiteralPath $liteOsSource -Destination $liteOsTarget -Force
  if (Test-Path -LiteralPath $loaderSource -PathType Leaf) {
    Copy-Item -LiteralPath $loaderSource -Destination (Join-Path $artifactRoot "rk2206_db_loader.bin") -Force
  }
}

if (-not (Test-Path -LiteralPath $sampleRoot -PathType Container)) {
  throw "OpenHarmony sample is missing: $sampleRoot"
}
if (-not (docker inspect $ContainerName 2>$null)) {
  throw "Docker container is unavailable: $ContainerName"
}

New-Item -ItemType Directory -Force -Path $backupRoot, $artifactRoot | Out-Null
foreach ($pattern in @(
    "rk2206-node-*-xls1-compact-v2-*.bin",
    "rk2206-node-*-xls1-compact-v2-*.img",
    "rk2206-node-*-xls1-compact-v3-*.bin",
    "rk2206-node-*-xls1-compact-v3-*.img",
    "rk2206-node-*-xls1-compact-v4-*.bin",
    "rk2206-node-*-xls1-compact-v4-*.img",
    "rk2206_db_loader.bin",
    "manifest.json"
  )) {
  Get-ChildItem -LiteralPath $artifactRoot -File -Filter $pattern -ErrorAction SilentlyContinue |
    Remove-Item -Force
}
$artifactCalibrationPath = Join-Path $artifactRoot "battery-calibration.json"
if ($resolvedBatteryCalibrationFile) {
  if ([System.IO.Path]::GetFullPath($resolvedBatteryCalibrationFile) -ne
      [System.IO.Path]::GetFullPath($artifactCalibrationPath)) {
    Copy-Item -LiteralPath $resolvedBatteryCalibrationFile -Destination $artifactCalibrationPath -Force
  }
} elseif (Test-Path -LiteralPath $artifactCalibrationPath -PathType Leaf) {
  Remove-Item -LiteralPath $artifactCalibrationPath -Force
}
$originalFiles = @{}

try {
  foreach ($relative in $syncFiles) {
    $source = Join-Path $sourceRoot $relative
    $target = Join-Path $sampleRoot $relative
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      throw "Experiment source is missing: $source"
    }

    $targetExists = Test-Path -LiteralPath $target -PathType Leaf
    $originalFiles[$relative] = $targetExists
    if ($targetExists) {
      $backup = Join-Path $backupRoot $relative
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
      Copy-Item -LiteralPath $target -Destination $backup -Force
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Force
  }

  Set-GnssRtcmInjectionMode
  Set-CompactTelemetryVersion
  Set-FieldSensorMode

  foreach ($node in $nodes | Where-Object { $_.Label -in $NodeLabels }) {
    $nodeCalibration = $nodeBatteryCalibrations[$node.Label]
    Set-BatteryCalibration `
      -GainPpm $nodeCalibration.gainPpm `
      -OffsetMv $nodeCalibration.offsetMv `
      -Verified $nodeCalibration.verified
    Set-NodeIdentity -Node $node
    Write-Host ("Building compact XLS1 firmware for node {0} ({1})" -f $node.Label, $node.DeviceId)
    docker exec $ContainerName bash -lc "cd /root/workspace/txsmartropenharmony && hb build -f"
    if ($LASTEXITCODE -ne 0) {
      throw "OpenHarmony build failed for node $($node.Label)"
    }
    Copy-BuildOutputs -Node $node
  }

  $files = Get-ChildItem -LiteralPath $artifactRoot -File |
    Where-Object Extension -in ".bin", ".img" |
    Sort-Object Name
  $sourceConfigPath = Join-Path $sourceRoot "config\app_config.h"
  $batterySeriesCells = Get-UnsignedMacroValue -Path $sourceConfigPath -Macro "BATTERY_SERIES_CELLS"
  $batteryParallelStrings = Get-UnsignedMacroValue -Path $sourceConfigPath -Macro "BATTERY_PARALLEL_STRINGS"
  $batteryCapacityMah = Get-UnsignedMacroValue -Path $sourceConfigPath -Macro "BATTERY_NOMINAL_CAPACITY_MAH"
  $batteryNominalVoltageMv = Get-UnsignedMacroValue -Path $sourceConfigPath -Macro "BATTERY_NOMINAL_VOLTAGE_MV"
  $calibrationManifest = [ordered]@{}
  foreach ($node in $nodes | Where-Object { $_.Label -in $NodeLabels }) {
    $nodeCalibration = $nodeBatteryCalibrations[$node.Label]
    $calibrationManifest[$node.Label] = [ordered]@{
      gainPpm = $nodeCalibration.gainPpm
      offsetMv = $nodeCalibration.offsetMv
      verified = $nodeCalibration.verified
    }
  }
  $globalCalibrationGainPpm = if ($resolvedBatteryCalibrationFile) { $null } else { $BatteryCalibrationGainPpm }
  $globalCalibrationOffsetMv = if ($resolvedBatteryCalibrationFile) { $null } else { $BatteryCalibrationOffsetMv }
  $manifest = [ordered]@{
    schemaVersion = 1
    profile = "rk2206-xl01-compact-v$CompactVersion-$FieldSensorMode"
    compactVersion = $CompactVersion
    sourceCommit = $sourceCommit
    sourceDirty = $sourceDirty
    gnssRtcmInjectionMode = $GnssRtcmInjectionMode
    rtcmRuntimeBootMode = "disabled"
    rtcmRuntimeControlEnabled = $GnssRtcmInjectionMode -ne "disabled"
    fieldSensorMode = $FieldSensorMode
    fieldSensorTruth = if ($FieldSensorMode -eq "simulated") { "RS485 values simulated; GPS and battery are real" } else { "RS485, GPS and battery are real" }
    rs485HardwareInitialized = $FieldSensorMode -eq "hardware"
    battery = [ordered]@{
      topology = "${batterySeriesCells}S${batteryParallelStrings}P"
      nominalCapacityMah = $batteryCapacityMah
      nominalVoltageMv = $batteryNominalVoltageMv
      nominalEnergyWh = [math]::Round(($batteryCapacityMah * $batteryNominalVoltageMv) / 1000000.0, 1)
      adcRoute = "PC0/SARADC channel 0 input-only"
      dividerOhms = "100000/27000"
      calibrationGainPpm = $globalCalibrationGainPpm
      calibrationOffsetMv = $globalCalibrationOffsetMv
      calibrationSourceSha256 = $batteryCalibrationFileSha256
      calibrationByNode = $calibrationManifest
      socMethod = "trimmed ADC mean + calibrated voltage + IIR + 3S voltage curve"
    }
    firmwareMarker = Get-QuotedMacroValue -Path (Join-Path $sampleRoot "main\landslide_main.c") -Macro "FW_RX_DIAG_MARKER"
    sampleVersion = Get-QuotedMacroValue -Path (Join-Path $sampleRoot "config\app_config.h") -Macro "FIRMWARE_SAMPLE_VERSION"
    compactPayloadBytes = if ($CompactVersion -eq 4) { 139 } else { 95 }
    fieldLinkWireBytes = if ($CompactVersion -eq 4) { 157 } else { 113 }
    compactPollCommandBytes = 10
    compactPollWireBytes = 28
    nodeSlotMs = 340
    rollbackRelease = "competition-suite-20260723"
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    files = @($files | ForEach-Object {
      [ordered]@{
        name = $_.Name
        bytes = $_.Length
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      }
    })
  }
  $manifestPath = Join-Path $artifactRoot "manifest.json"
  [System.IO.File]::WriteAllText(
    $manifestPath,
    (($manifest | ConvertTo-Json -Depth 8) + [Environment]::NewLine),
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Host "Artifacts: $artifactRoot"
  Write-Host "Manifest:  $manifestPath"
} finally {
  if (-not $KeepSdkExperimentSource) {
    foreach ($relative in $syncFiles) {
      $target = Join-Path $sampleRoot $relative
      if ($originalFiles[$relative]) {
        Copy-Item -LiteralPath (Join-Path $backupRoot $relative) -Destination $target -Force
      } elseif (Test-Path -LiteralPath $target -PathType Leaf) {
        [System.IO.File]::Delete($target)
      }
    }
  }

  if (Test-Path -LiteralPath $backupRoot -PathType Container) {
    [System.IO.Directory]::Delete($backupRoot, $true)
  }
}
