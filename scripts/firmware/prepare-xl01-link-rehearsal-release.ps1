[CmdletBinding()]
param(
  [string]$SdkRoot = "F:\2\openharmony\txsmartropenharmony",
  [string]$ContainerName = "openharmony-dev",
  [string]$ArtifactDirectory = "F:\2\openharmony\rk2206_firmware_releases\xls1_link_rehearsal_battery_simulated_20260801",
  [ValidateRange(800000, 1200000)]
  [int]$BatteryCalibrationGainPpm = 1000000,
  [ValidateRange(-2000, 2000)]
  [int]$BatteryCalibrationOffsetMv = 0,
  [string]$BatteryCalibrationFile = "",
  [ValidateSet("A", "B", "C")]
  [string[]]$NodeLabels = @("A", "B", "C")
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$dirty = @(& git -C $repoRoot status --porcelain --untracked-files=normal)
if ($LASTEXITCODE -ne 0) {
  throw "Cannot inspect repository state before release"
}
if ($dirty.Count -ne 0) {
  throw "Refusing to create an official firmware release from uncommitted source"
}

$builder = Join-Path $PSScriptRoot "build-xl01-compact-v3.ps1"
if (-not (Test-Path -LiteralPath $builder -PathType Leaf)) {
  throw "Firmware builder is missing: $builder"
}

& $builder `
  -SdkRoot $SdkRoot `
  -ContainerName $ContainerName `
  -ArtifactDirectory $ArtifactDirectory `
  -GnssRtcmInjectionMode disabled `
  -FieldSensorMode simulated `
  -BatteryCalibrationGainPpm $BatteryCalibrationGainPpm `
  -BatteryCalibrationOffsetMv $BatteryCalibrationOffsetMv `
  -BatteryCalibrationFile $BatteryCalibrationFile `
  -NodeLabels $NodeLabels

if ($LASTEXITCODE -ne 0) {
  throw "Simulated XLS1 link rehearsal release build failed"
}

$manifestPath = Join-Path $ArtifactDirectory "manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Release manifest is missing: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.fieldSensorMode -ne "simulated" -or
    $manifest.gnssRtcmInjectionMode -ne "disabled" -or
    $manifest.rs485HardwareInitialized -ne $false -or
    $manifest.sourceDirty -ne $false) {
  throw "Release manifest does not describe a safe simulated rehearsal profile"
}

$headCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $manifest.sourceCommit -ne $headCommit) {
  throw "Release manifest source commit does not match repository HEAD"
}

$expectedCalibrationVerified = [bool]$BatteryCalibrationFile -or
  $BatteryCalibrationGainPpm -ne 1000000 -or
  $BatteryCalibrationOffsetMv -ne 0
foreach ($node in $NodeLabels) {
  $calibrationProperty = $manifest.battery.calibrationByNode.PSObject.Properties[$node]
  if ($null -eq $calibrationProperty -or
      $calibrationProperty.Value.verified -ne $expectedCalibrationVerified) {
    throw "Release manifest is missing the expected battery calibration state for node $node"
  }
}
if ($BatteryCalibrationFile) {
  $artifactCalibrationPath = Join-Path $ArtifactDirectory "battery-calibration.json"
  if (-not (Test-Path -LiteralPath $artifactCalibrationPath -PathType Leaf)) {
    throw "Calibrated release is missing battery-calibration.json"
  }
  $artifactCalibrationSha256 =
    (Get-FileHash -LiteralPath $artifactCalibrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($manifest.battery.calibrationSourceSha256 -ne $artifactCalibrationSha256) {
    throw "Battery calibration source hash does not match the release manifest"
  }
}

$expectedFiles = @("rk2206_db_loader.bin")
$nodeIds = @{
  A = "00000000-0000-0000-0000-000000000001"
  B = "00000000-0000-0000-0000-000000000002"
  C = "00000000-0000-0000-0000-000000000003"
}
foreach ($node in $NodeLabels) {
  $expectedFiles += "rk2206-node-$node-xls1-compact-v3-simulated.bin"
  $expectedFiles += "rk2206-node-$node-xls1-compact-v3-simulated.img"
}
$actualFiles = @($manifest.files | ForEach-Object { $_.name })
$fileDifference = @(Compare-Object ($expectedFiles | Sort-Object) ($actualFiles | Sort-Object))
if ($fileDifference.Count -ne 0) {
  throw "Release file set is incomplete or contains stale firmware artifacts"
}

foreach ($entry in $manifest.files) {
  $path = Join-Path $ArtifactDirectory $entry.name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Manifest file is missing: $path"
  }
  $item = Get-Item -LiteralPath $path
  $sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($item.Length -ne $entry.bytes -or $sha256 -ne $entry.sha256) {
    throw "Manifest size/hash mismatch: $path"
  }
}

foreach ($node in $NodeLabels) {
  $path = Join-Path $ArtifactDirectory "rk2206-node-$node-xls1-compact-v3-simulated.bin"
  $ascii = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($path))
  foreach ($required in @(
      $nodeIds[$node],
      "FIELD-NODE-$node",
      $manifest.firmwareMarker,
      $manifest.sampleVersion,
      "SIMULATED (RS485 values only)"
  )) {
    if (-not $ascii.Contains($required)) {
      throw "Node $node image is missing required identity/profile marker: $required"
    }
  }
  foreach ($otherNode in @("A", "B", "C") | Where-Object { $_ -ne $node }) {
    if ($ascii.Contains($nodeIds[$otherNode]) -or $ascii.Contains("FIELD-NODE-$otherNode")) {
      throw "Node $node image contains node $otherNode identity"
    }
  }
  foreach ($forbidden in @("SC16IS752", "[RS485]", "EI2C0_M0 PB4/PB5")) {
    if ($ascii.Contains($forbidden)) {
      throw "Node $node simulated image still contains RS485 implementation marker: $forbidden"
    }
  }
}

$calibrationDescription = if ($BatteryCalibrationFile) {
  "per-node field-calibrated with final acceptance; see battery-calibration.json and manifest.json"
} elseif ($expectedCalibrationVerified) {
  "shared manual field calibration; see manifest.json"
} else {
  "neutral default calibration; verify each node against a multimeter before precision claims"
}
$releaseDate = Get-Date -Format "yyyy-MM-dd"
$expectedBatteryState = if ($expectedCalibrationVerified) {
  "field-calibrated"
} else {
  "default-calibration"
}
$finalAcceptanceFlag = if ($expectedCalibrationVerified) {
  " -RequireFinalBatteryAcceptance"
} else {
  ""
}
$instructions = @"
XLS1 link rehearsal firmware - $releaseDate

Profile: simulated RS485 values; real UM220 GNSS; real PC0 battery; RTCM injection disabled.
XLS1 module configuration is preserved. The firmware only uses EUART2_M1 PB2/PB3 for data.
Battery calibration: $calibrationDescription.
Burn the .img matching the physical node label. Do not interchange A/B/C images.
Source commit: $headCommit

After the SC16IS752/RS485 interface is installed and passes the power-off gate, build the hardware profile with:
  powershell -ExecutionPolicy Bypass -File scripts/firmware/build-xl01-compact-v3.ps1 -FieldSensorMode hardware -GnssRtcmInjectionMode disabled

Release verification:
  powershell -ExecutionPolicy Bypass -File scripts/firmware/verify-rk2206-release-safety.ps1 -ArtifactDirectory "$ArtifactDirectory" -ExpectedFieldSensorMode simulated -ExpectedGnssRtcmInjectionMode disabled -ExpectedBatteryCalibrationState $expectedBatteryState -ExpectedSourceCommit $headCommit$finalAcceptanceFlag
"@
[System.IO.File]::WriteAllText(
  (Join-Path $ArtifactDirectory "FLASHING-INSTRUCTIONS.txt"),
  $instructions,
  [System.Text.UTF8Encoding]::new($false)
)

$verifier = Join-Path $PSScriptRoot "verify-rk2206-release-safety.ps1"
if (-not (Test-Path -LiteralPath $verifier -PathType Leaf)) {
  throw "Release safety verifier is missing: $verifier"
}
& $verifier `
  -ArtifactDirectory $ArtifactDirectory `
  -ExpectedFieldSensorMode simulated `
  -ExpectedGnssRtcmInjectionMode disabled `
  -ExpectedBatteryCalibrationState $expectedBatteryState `
  -ExpectedSourceCommit $headCommit `
  -RequireFinalBatteryAcceptance:$expectedCalibrationVerified
if ($LASTEXITCODE -ne 0) {
  throw "Safe rehearsal package failed the release safety verifier"
}

Write-Host "Safe rehearsal package: $ArtifactDirectory"
Write-Host "RS485 values: simulated; GPS: real; PC0 battery: real; RTCM injection: disabled"
